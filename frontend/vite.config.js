import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: ['mechanic-incentive.up.railway.app', 'localhost', '127.0.0.1']
  }
})
