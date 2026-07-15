import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward API calls to the BloodFang backend so the browser stays same-origin
    // (no CORS issues) during development.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
