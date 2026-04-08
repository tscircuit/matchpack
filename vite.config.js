import { defineConfig } from "vite"
import { resolve } from "path"

export default defineConfig({
   optimizeDeps: {
    include: ['react', 'react-dom', 'graphics-debug/react']
  },
  resolve: {
    alias: {
      lib: resolve(__dirname, "lib"),
    },
  },
})
