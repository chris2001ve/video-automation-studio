// Servidor de control remoto en la red local (Wi-Fi).
// Sirve la misma interfaz web y expone las acciones de la app protegidas con un código de acceso.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

export type Handler = (...args: any[]) => unknown;

export interface RemoteInfo {
  enabled: boolean;
  running: boolean;
  port: number;
  urls: string[];
  token: string;
  clients: number;
  error: string | null;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
};

/** Código fácil de escribir (sin 0/O, 1/I): 8 caracteres en dos grupos. */
export function newToken(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += alphabet[bytes[i] % alphabet.length];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normalizeToken(t: string): string {
  return t.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(normalizeToken(given));
  const b = Buffer.from(normalizeToken(expected));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

export function lanAddresses(): string[] {
  const all: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) if (ni.family === 'IPv4' && !ni.internal) all.push(ni.address);
  }
  // Las direcciones 169.254.x solo se usan si no hay otra (red sin router/DHCP).
  const preferred = all.filter((a) => !a.startsWith('169.254.'));
  const out = preferred.length ? preferred : all;
  // Primero las redes domésticas típicas (192.168.x / 10.x).
  return out.sort((a, b) => Number(!/^(192\.168|10\.)/.test(a)) - Number(!/^(192\.168|10\.)/.test(b)));
}

export class RemoteServer {
  private server: http.Server | null = null;
  private clients = new Set<http.ServerResponse>();
  private failures = new Map<string, { n: number; until: number }>();
  private error: string | null = null;
  private port = 0;

  constructor(
    private opts: {
      staticDir: string;
      handlers: Record<string, Handler>;
      getToken: () => string;
      appName: string;
      onClient?: (event: 'connect' | 'disconnect', ip: string, count: number) => void;
    },
  ) {}

  get running() { return !!this.server?.listening; }

  info(enabled: boolean, token: string): RemoteInfo {
    const port = this.port;
    return {
      enabled, running: this.running, port, token, clients: this.clients.size, error: this.error,
      urls: this.running ? lanAddresses().map((ip) => `http://${ip}:${port}/`) : [],
    };
  }

  async start(port: number): Promise<void> {
    if (this.running && this.port === port) return;
    await this.stop();
    this.error = null;
    const srv = http.createServer((req, res) => this.handle(req, res).catch((e) => {
      if (!res.headersSent) this.json(res, 500, { error: e?.message ?? String(e) });
    }));
    await new Promise<void>((resolve) => {
      srv.once('error', (e: any) => {
        this.error = e?.code === 'EADDRINUSE' ? `El puerto ${port} ya está en uso` : (e?.message ?? String(e));
        this.server = null;
        resolve();
      });
      srv.listen(port, '0.0.0.0', () => { this.server = srv; this.port = port; resolve(); });
    });
  }

  async stop(): Promise<void> {
    for (const c of this.clients) c.end();
    this.clients.clear();
    const srv = this.server;
    this.server = null;
    if (srv) await new Promise<void>((r) => srv.close(() => r()));
  }

  /** Envía un evento a todos los celulares conectados. */
  broadcast(event: 'state' | 'log' | 'settings' | 'keys', data: unknown) {
    if (!this.clients.size) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of this.clients) c.write(payload);
  }

  /** Desconecta a todos (p. ej. al cambiar el código). */
  kickAll() {
    for (const c of this.clients) c.end();
    this.clients.clear();
  }

  private ip(req: http.IncomingMessage) {
    return (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
  }

  private authorized(req: http.IncomingMessage, url: URL): boolean {
    const ip = this.ip(req);
    const f = this.failures.get(ip);
    if (f && f.until > Date.now()) return false;
    const header = req.headers.authorization ?? '';
    const given = header.startsWith('Bearer ') ? header.slice(7) : (url.searchParams.get('k') ?? '');
    const ok = tokenMatches(given, this.opts.getToken());
    if (ok) { this.failures.delete(ip); return true; }
    const n = (f?.n ?? 0) + 1;
    // Tras 10 intentos fallidos, bloqueo de 60 s para esa IP.
    this.failures.set(ip, { n: n >= 10 ? 0 : n, until: n >= 10 ? Date.now() + 60_000 : 0 });
    return false;
  }

  private json(res: http.ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  private readBody(req: http.IncomingMessage, limit = 4 * 1024 * 1024): Promise<string> {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > limit) { reject(new Error('Solicitud demasiado grande')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://local');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    if (url.pathname === '/api/ping') {
      return this.json(res, 200, { app: 'video-automation-studio', name: this.opts.appName, host: os.hostname() });
    }

    if (url.pathname === '/api/events') {
      if (!this.authorized(req, url)) return this.json(res, 401, { error: 'Código incorrecto' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 2000\n\n');
      this.clients.add(res);
      const ip = this.ip(req);
      this.opts.onClient?.('connect', ip, this.clients.size);
      const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
      req.on('close', () => {
        clearInterval(ping);
        if (this.clients.delete(res)) this.opts.onClient?.('disconnect', ip, this.clients.size);
      });
      return;
    }

    if (url.pathname === '/api/call') {
      if (req.method !== 'POST') return this.json(res, 405, { error: 'Método no permitido' });
      if (!this.authorized(req, url)) return this.json(res, 401, { error: 'Código incorrecto' });
      let body: { ch?: string; args?: unknown[] };
      try { body = JSON.parse(await this.readBody(req)); } catch { return this.json(res, 400, { error: 'JSON inválido' }); }
      const fn = body.ch ? this.opts.handlers[body.ch] : undefined;
      if (!fn) return this.json(res, 404, { error: `Acción no disponible desde el celular: ${body.ch}` });
      const result = await fn(...(Array.isArray(body.args) ? body.args : []));
      return this.json(res, 200, { result: result ?? null });
    }

    if (url.pathname.startsWith('/api/')) return this.json(res, 404, { error: 'No encontrado' });

    // Archivos estáticos de la interfaz.
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const root = path.resolve(this.opts.staticDir);
    let file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  }
}
