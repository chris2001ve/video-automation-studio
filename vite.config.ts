import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, strictPort: false },
});
