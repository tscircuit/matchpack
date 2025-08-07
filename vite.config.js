import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      lib: resolve(__dirname, 'lib')
    }
  },
  "mainScriptUrl": "/src/main.tsx",
})
