import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    },
    minify: false,
    cssMinify: false,
    sourcemap: false,
  },
  esbuild: {
    target: 'esnext',
    minify: false,
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  }
});