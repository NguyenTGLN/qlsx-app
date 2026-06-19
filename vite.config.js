import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react()
  ],
  // Honor PORT env (dùng cho preview/tooling tự gán cổng); để trống → Vite tự chọn mặc định
  server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
})
