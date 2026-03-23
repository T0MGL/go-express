import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }): UserConfig => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
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
          'vendor-scanner': ['html5-qrcode', 'qrcode'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  esbuild: mode === 'production' ? {
    drop: ['console', 'debugger'],
  } : undefined,
}));
