import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    host: '0.0.0.0', // Bind to all network interfaces
    port: 5173,      // Explicit port
    cors: true,      // Enable CORS
  }
})
