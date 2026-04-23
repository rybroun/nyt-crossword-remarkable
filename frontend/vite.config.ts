import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8742',
    },
  },
  build: {
    outDir: '../src/nyt_crossword_remarkable/frontend/dist',
    emptyOutDir: true,
  },
})
