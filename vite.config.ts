/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(() => {
  const normalizeBase = (value: string) => {
    const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
    return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
  }
  const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
  const ghPagesBase =
    process.env.GITHUB_PAGES === 'true' && repoName ? `/${repoName}/` : '/'
  const base = normalizeBase(process.env.VITE_BASE_PATH ?? ghPagesBase)

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icons/icon-192.svg', 'icons/icon-512.svg'],
        manifest: {
          name: 'GLP-1 Level Tracker',
          short_name: 'GLP-1 Tracker',
          description: 'Offline GLP-1 medication level tracker.',
          id: base,
          theme_color: '#111827',
          background_color: '#111827',
          display: 'standalone',
          scope: base,
          start_url: base,
          orientation: 'portrait',
          icons: [
            {
              src: 'icons/icon-192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
            },
            {
              src: 'icons/icon-512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
          navigateFallback: `${base}index.html`,
        },
      }),
    ],
    optimizeDeps: {
      include: ['dexie'],
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
  }
})
