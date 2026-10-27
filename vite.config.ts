import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // build/ (not Vite's default dist/) matches the output folder the DigitalOcean deploy expects
  build: {
    outDir: 'build',
  },
})
