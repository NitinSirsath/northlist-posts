import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = `http://localhost:${process.env.PORT ?? 3590}`;

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: {
    port: Number(process.env.WEB_PORT ?? 5590),
    strictPort: true,
    allowedHosts: ['.localhost'],
    // Trailing slashes matter: '/api' alone would also catch the app's own /api.ts module.
    proxy: {
      '/api/': apiTarget,
      '/mcp': apiTarget,
      '/r/': apiTarget,
    },
  },
});
