import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// Codigo al que el repartidor nunca llega. Se emite bajo assets/desk/ para que el
// service worker pueda excluirlo del precache con un solo glob: el repartidor
// trabaja sin senal y su precache tiene que ser el shell que usa, no la app entera.
// Al agregar una pagina de escritorio fuera de estas carpetas, sumarla aca.
const DESKTOP_SOURCE = /\/src\/(pages\/(admin|cliente)|components\/printing)\//;
// Librerias que solo viven detras de imprimir etiqueta o escanear codigo.
const DESKTOP_VENDOR = /\/node_modules\/(jspdf|jsbarcode|html2canvas|dompurify|canvg|html5-qrcode|qrcode|recharts)\//;
// Dependencias transitivas de las anteriores. Toleradas dentro de un chunk de
// escritorio, nunca suficientes por si solas: un chunk de puros polyfills puede
// ser compartido con el repartidor y sacarlo del precache lo dejaria sin app.
const SHARED_RUNTIME = /\/node_modules\/(@babel\/runtime|core-js|regenerator-runtime|rgbcolor|stackblur-canvas|fflate|fast-png|iobuffer|pako|raf|svg-pathdata|performance-now)\//;

// Rollup entrega ids con prefijo \0 y sufijo ?commonjs-* para modulos virtuales
// y proxies de interop. Sin normalizar, ningun chunk de vendor clasifica.
const normalizeModuleId = (id: string) => id.replace(/^\0/, '').replace(/\?.*$/, '');

function isDesktopOnlyChunk(moduleIds: readonly string[]): boolean {
  if (moduleIds.length === 0) return false;

  const ids = moduleIds.map(normalizeModuleId);
  const isDesktop = (id: string) => DESKTOP_SOURCE.test(id) || DESKTOP_VENDOR.test(id);
  // Helpers virtuales de Vite (preload-helper y similares) no vienen de disco.
  const isNeutral = (id: string) => !id.startsWith('/') || SHARED_RUNTIME.test(id);

  return ids.some(isDesktop) && ids.every((id) => isDesktop(id) || isNeutral(id));
}

export default defineConfig(({ mode }): UserConfig => ({
  server: {
    host: "::",
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'],
      manifest: {
        name: 'GO EXPRESS',
        short_name: 'GO EXPRESS',
        description: 'Portal de envíos y repartidores',
        theme_color: '#0643F7',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/repartidor',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2}'],
        globIgnores: [
          'assets/desk/**',
          // Originales de marca: los consumen el email transaccional y las OG cards,
          // la app sirve las variantes de public/brand. Juntos pesan 554 KB.
          'isotipo.png',
          'logotipo.png',
          // Screenshot del hero de la landing, 222 KB que solo ve un visitante web.
          'brand/hero-*',
        ],
        navigateFallbackDenylist: [/^\/api/, /^\/privacidad/, /^\/terminos/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.goexpressparaguay\.com\/api\/public\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-public-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 30, maxAgeSeconds: 300 },
            },
          },
          {
            // Fuera del precache pero con hash de contenido en el nombre, asi que
            // una vez descargado nunca cambia: admin y cliente siguen andando
            // offline despues de la primera visita a cada pantalla.
            urlPattern: /\/assets\/desk\/.*\.(?:js|css)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'desk-chunks',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\/brand\/hero-.*\.(?:webp|png)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'landing-media',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: mode !== 'production',
    minify: 'esbuild',
    target: 'es2020',
    rollupOptions: {
      output: {
        chunkFileNames: (chunk) =>
          isDesktopOnlyChunk(chunk.moduleIds)
            ? 'assets/desk/[name]-[hash].js'
            : 'assets/[name]-[hash].js',
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-popover',
            '@radix-ui/react-tabs',
          ],
          'vendor-motion': ['motion'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-forms': ['react-hook-form', 'zod', '@hookform/resolvers'],
          'vendor-charts': ['recharts'],
          'vendor-scanner': ['html5-qrcode'],
          'vendor-print': ['jspdf', 'jsbarcode'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  esbuild: mode === 'production' ? {
    drop: ['console', 'debugger'],
  } : undefined,
}));
