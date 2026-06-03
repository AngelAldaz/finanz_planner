/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Finanz — flujo de efectivo',
        short_name: 'Finanz',
        description: 'Planeador de flujo de efectivo por semana, con escenarios.',
        lang: 'es-MX',
        theme_color: '#ccff00',
        background_color: '#f4f1e8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [],
      },
    }),
  ],
  test: {
    // El dominio es puro → entorno node. (Para tests de componentes en F3 usaremos happy-dom por archivo.)
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
})
