/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub Pages sirve bajo /finanz_planner/ ; local queda en '/'
  base: process.env.BASE_PATH || '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // inyecta nuestros handlers de push/click en el SW generado por Workbox
      workbox: { importScripts: ['push-sw.js'] },
      manifest: {
        name: 'Finanz — flujo de efectivo',
        short_name: 'Finanz',
        description: 'Planeador de flujo de efectivo por semana, con escenarios.',
        lang: 'es-MX',
        theme_color: '#ccff00',
        background_color: '#f4f1e8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
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
