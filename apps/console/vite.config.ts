import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@hotelia/shared': path.resolve(__dirname, '../../packages/shared/src'),
      '@hotelia/events': path.resolve(__dirname, '../../packages/events/src'),
    },
  },
  server: {
    port: 3010,
    strictPort: true,
  },
});
