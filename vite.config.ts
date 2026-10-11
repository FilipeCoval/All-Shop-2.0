
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
      tailwindcss(),
      react(),
      VitePWA({
        // Uma atualização automática a meio de um formulário administrativo
        // pode apagar trabalho ainda não guardado. O utilizador escolhe quando
        // aplicar a nova versão através do aviso apresentado na interface.
        registerType: 'prompt',
        injectRegister: false,
        manifest: false,
        workbox: {
          cleanupOutdatedCaches: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/admin(?:\/|$)/, /^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) => request.mode === 'navigate' && (url.pathname === '/admin' || url.pathname === '/admin.html'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'allshop-admin-shell',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 3, maxAgeSeconds: 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'allshop-images',
                expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      })
    ],
    base: '/', 
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        input: {
          loja: 'index.html',
          admin: 'admin.html'
        }
      }
    }
});
