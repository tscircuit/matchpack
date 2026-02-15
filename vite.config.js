import { defineConfig } from "vite"
import { resolve } from "path"

export default defineConfig({
  resolve: {
    alias: [
      // Preserve existing "lib/..." absolute-ish imports.
      { find: /^lib$/, replacement: resolve(__dirname, "lib") },
      { find: /^lib\//, replacement: `${resolve(__dirname, "lib")}/` },

      // circuit-to-svg@0.0.174 doesn't export convertCircuitJsonToSchematicSimulationSvg
      // but @tscircuit/schematic-viewer expects it.
      // Important: match ONLY the bare specifier so subpath imports like
      // "circuit-to-svg/dist/index.js" still resolve to the real package.
      {
        find: /^circuit-to-svg$/,
        replacement: resolve(__dirname, "lib/shims/circuit-to-svg.ts"),
      },
    ],
  },
})
