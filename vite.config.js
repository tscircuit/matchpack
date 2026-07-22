import { defineConfig } from "vite"
import { resolve } from "path"

export default defineConfig({
  resolve: {
    alias: {
      lib: resolve(__dirname, "lib"),
      "bun:test": "vitest",
    },
    dedupe: ["react", "react-dom"],
  },
})
