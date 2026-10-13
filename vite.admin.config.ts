import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const projectRoot = __dirname;

export default defineConfig({
  root: resolve(projectRoot, 'admin-app'),
  publicDir: resolve(projectRoot, 'admin-app/public'),
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      filename: 'admin-sw.js',
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'allshop-admin-images',
              expiration: { maxEntries: 40, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  base: '/',
  build: {
    outDir: resolve(projectRoot, 'dist-admin'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      input: resolve(projectRoot, 'admin-app/index.html'),
      output: {
        entryFileNames: 'assets/admin-[hash].js',
        chunkFileNames: 'assets/admin-chunk-[hash].js',
        assetFileNames: 'assets/admin-[hash][extname]',
      },
    },
  },
});
