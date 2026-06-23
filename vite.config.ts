import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages needs the subpath; local dev is simpler at http://localhost:5173/
  base: command === 'serve' ? '/' : '/building-map-explorer/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}))
