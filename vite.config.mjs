import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = path.resolve(import.meta.dirname, '.');
const legacyAssets = [
  ['app.js', 'application/javascript; charset=utf-8', path.join(projectRoot, 'app.js')],
  ['styles.css', 'text/css; charset=utf-8', path.join(projectRoot, 'styles.css')],
  ['favicon.svg', 'image/svg+xml', path.join(projectRoot, 'favicon.svg')],
  ['lucide.min.js', 'application/javascript; charset=utf-8', path.join(projectRoot, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js')],
];

function legacyAssetPlugin() {
  return {
    name: 'pointline-legacy-assets',
    configureServer(server) {
      server.middlewares.use('/legacy', (request, response, next) => {
        const filename = new URL(request.url || '/', 'http://localhost').pathname.slice(1);
        const asset = legacyAssets.find(([name]) => name === filename);
        if (!asset) return next();
        response.setHeader('content-type', asset[1]);
        response.end(fs.readFileSync(asset[2]));
      });
    },
    generateBundle() {
      legacyAssets.forEach(([name, , source]) => {
        this.emitFile({ type: 'asset', fileName: `legacy/${name}`, source: fs.readFileSync(source) });
      });
    },
  };
}

export default defineConfig({
  root: path.join(projectRoot, 'frontend'),
  plugins: [react(), legacyAssetPlugin()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: path.join(projectRoot, 'frontend', 'dist'),
    emptyOutDir: true,
  },
});
