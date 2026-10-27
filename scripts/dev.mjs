// Arranca Vite + esbuild (watch) + Electron con un solo comando: npm run dev
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { context } from 'esbuild';
import electron from 'electron';

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls.local[0];

let child = null;
const startElectron = () => {
  if (child) { child.removeAllListeners('exit'); child.kill(); }
  child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
  child.on('exit', () => { server.close(); process.exit(0); });
};

const ctx = await context({
  entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
  outdir: 'dist-electron', bundle: true, platform: 'node', format: 'cjs', target: 'node20',
  external: ['electron'], sourcemap: 'inline',
  plugins: [{ name: 'restart', setup(b) { b.onEnd((r) => { if (r.errors.length === 0) startElectron(); }); } }],
});
await ctx.watch();
