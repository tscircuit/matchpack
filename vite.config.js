import { defineConfig } from "vite"
import { resolve } from "path"

export default defineConfig({
  resolve: {
    alias: {
      lib: resolve(__dirname, "lib"),
    },
  },
  server: {
    https: true,
  }
})
