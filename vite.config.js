import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache the app shell (HTML/JS/CSS) so the app opens with zero
      // internet after the first successful visit. Actual data still comes
      // from src/dbClient.js's own localStorage cache/outbox.
      includeAssets: [],
      manifest: {
        name: 'Krushi Bill',
        short_name: 'Krushi Bill',
        description: 'Billing & Stock Management',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#166534',
        icons: []
      },
      workbox: {
        // App shell: cache-first so it loads instantly and works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            // Google Fonts used by styles.css — cache them too so fonts
            // don't disappear offline after the first load.
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173
  }
});
