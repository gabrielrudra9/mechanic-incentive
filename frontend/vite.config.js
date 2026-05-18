import { defineConfig } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'

export default defineConfig({
  plugins: [sveltekit()],
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: ['mechanic-incentive.up.railway.app', 'localhost', '127.0.0.1']
  }
})
