
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const adminBuildVersion = process.env.VERCEL_DEPLOYMENT_ID || `${Date.now()}`;

const adminBuildMetadata = (): Plugin => ({
  name: 'allshop-admin-build-metadata',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'admin-build.json',
      source: JSON.stringify({ version: adminBuildVersion }),
    });
  },
});

export default defineConfig({
    plugins: [
      tailwindcss(),
      react(),
      adminBuildMetadata(),
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
          globIgnores: ['admin.html', 'admin-sw.js', 'admin-build.json', 'assets/admin-*.js', 'assets/admin-*.css'],
          runtimeCaching: [
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
