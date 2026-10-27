import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newToken, normalizeToken, RemoteServer, tokenMatches } from '../electron/remote';

describe('códigos de acceso', () => {
  it('genera códigos legibles de 8 caracteres', () => {
    for (let i = 0; i < 50; i++) expect(newToken()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  });
  it('compara sin importar guiones ni mayúsculas', () => {
    expect(normalizeToken('ab cd-23 45')).toBe('ABCD2345');
    expect(tokenMatches('abcd2345', 'ABCD-2345')).toBe(true);
    expect(tokenMatches('ABCD-2346', 'ABCD-2345')).toBe(false);
    expect(tokenMatches('', '')).toBe(false);
  });
});

describe('servidor remoto', () => {
  const token = 'TEST-2345';
  let dir: string;
  let srv: RemoteServer;
  let base: string;
  const calls: unknown[][] = [];

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vas-remote-'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<html>ok</html>');
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'assets', 'a.js'), 'console.log(1)');
    srv = new RemoteServer({
      staticDir: dir,
      handlers: { 'queue:start': (...a: unknown[]) => { calls.push(a); return 'ok'; }, echo: (x: unknown) => x },
      getToken: () => token,
      appName: 'Test',
    });
    await srv.start(0 as unknown as number);
    // puerto aleatorio asignado por el SO
    base = `http://127.0.0.1:${(srv as any).server.address().port}`;
  });
  afterAll(async () => { await srv.stop(); fs.rmSync(dir, { recursive: true, force: true }); });

  const call = (ch: string, args: unknown[] = [], k = token) =>
    fetch(`${base}/api/call`, { method: 'POST', headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ch, args }) });

  it('responde al ping sin código', async () => {
    const j = await (await fetch(`${base}/api/ping`)).json();
    expect(j.app).toBe('video-automation-studio');
  });

  it('rechaza un código incorrecto', async () => {
    expect((await call('queue:start', [], 'NOPE-NOPE')).status).toBe(401);
    expect(calls.length).toBe(0);
  });

  it('ejecuta acciones permitidas con el código correcto', async () => {
    const r = await call('echo', [{ a: 1 }], 'test2345');
    expect(r.status).toBe(200);
    expect((await r.json()).result).toEqual({ a: 1 });
  });

  it('no expone acciones que no están en la lista', async () => {
    expect((await call('dialog:folder')).status).toBe(404);
  });

  it('sirve la interfaz y evita salir de la carpeta', async () => {
    expect(await (await fetch(`${base}/`)).text()).toContain('ok');
    expect(await (await fetch(`${base}/assets/a.js`)).text()).toContain('console');
    const r = await fetch(`${base}/..%2f..%2fetc%2fpasswd`);
    expect(await r.text()).not.toContain('root:');
  });

  it('envía eventos en vivo a los celulares conectados', async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/events?k=${token}`, { signal: ctrl.signal });
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    await new Promise((r) => setTimeout(r, 50));
    srv.broadcast('log', { message: 'hola' });
    let text = '';
    while (!text.includes('hola')) text += new TextDecoder().decode((await reader.read()).value);
    expect(text).toContain('event: log');
    ctrl.abort();
  });
});
