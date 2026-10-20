import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      manifest: false,
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],

  build: {
    rolldownOptions: {
      input: {
        employee: fileURLToPath(new URL('./index.html', import.meta.url)),
        manager: fileURLToPath(
          new URL('./manager/index.html', import.meta.url),
        ),
      },
    },
  },

  server: {
    watch: {
      ignored: ['**/supabase/**'],
    },
  },
})
