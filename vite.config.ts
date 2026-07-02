
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
      tailwindcss(),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'All-Shop | Eletrónica e Gadgets',
          short_name: 'All-Shop',
          description: 'A sua loja virtual de confiança. Smartphones, TV Boxes e Cabos.',
          theme_color: '#3b82f6',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: 'https://i.imgur.com/nSiZKBf.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'https://i.imgur.com/nSiZKBf.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    base: '/', 
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 3000
    }
});
