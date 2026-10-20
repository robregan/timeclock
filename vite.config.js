import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',

      manifest: {
        name: 'ShiftClock Dev',
        short_name: 'ShiftClock',
        description: 'Employee time clock and shift management',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f4f0e7',
        theme_color: '#586950',

        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },

      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [],
      },

      devOptions: {
        enabled: false,
      },
    }),
  ],

  server: {
    watch: {
      ignored: ['**/supabase/**'],
    },
  },
})
