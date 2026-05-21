import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/",
  // server: {
  //   proxy: {
  //     '/api': {
  //       // Development proxy - only used during npm run dev
  //       target: 'https://api.kingcreativestudio.my.id',
  //       changeOrigin: true,
  //     },
  //   },
  // },
})