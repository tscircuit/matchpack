import { defineConfig } from "vite"
import { resolve } from "path"

export default defineConfig({
  resolve: {
    alias: {
      lib: resolve(__dirname, "lib"),
      react: resolve(__dirname, "node_modules/react"),
      "react-dom": resolve(__dirname, "node_modules/react-dom"),
      debug: resolve(__dirname, "debug-shim.js"),
      "debug/src/browser.js": resolve(__dirname, "debug-shim.js"),
      "performance-now": resolve(__dirname, "performance-now-shim.js"),
      "performance-now/lib/performance-now.js": resolve(
        __dirname,
        "performance-now-shim.js",
      ),
      boolbase: resolve(__dirname, "boolbase-shim.js"),
      "boolbase/index.js": resolve(__dirname, "boolbase-shim.js"),
      "object-hash": resolve(__dirname, "object-hash-shim.js"),
      "object-hash/dist/object_hash.js": resolve(
        __dirname,
        "object-hash-shim.js",
      ),
      "react-reconciler": resolve(__dirname, "react-reconciler-shim.js"),
      "react-reconciler/index.js": resolve(
        __dirname,
        "react-reconciler-shim.js",
      ),
      "react-reconciler/constants": resolve(
        __dirname,
        "react-reconciler-constants-shim.js",
      ),
      "react-reconciler/constants.js": resolve(
        __dirname,
        "react-reconciler-constants-shim.js",
      ),
      "react-reconciler/cjs/react-reconciler-constants.development.js": resolve(
        __dirname,
        "react-reconciler-constants-shim.js",
      ),
      "@tscircuit/core": resolve(__dirname, "tscircuit-core-shim.js"),
      "@tscircuit/core/dist/index.js": resolve(
        __dirname,
        "tscircuit-core-shim.js",
      ),
      "tscircuit/node_modules/@tscircuit/core": resolve(
        __dirname,
        "tscircuit-core-shim.js",
      ),
      "tscircuit/node_modules/@tscircuit/core/dist/index.js": resolve(
        __dirname,
        "tscircuit-core-shim.js",
      ),
      "@tscircuit/core/node_modules/react-reconciler": resolve(
        __dirname,
        "react-reconciler-shim.js",
      ),
      "@tscircuit/core/node_modules/react-reconciler/index.js": resolve(
        __dirname,
        "react-reconciler-shim.js",
      ),
      "@tscircuit/core/node_modules/react-reconciler/constants": resolve(
        __dirname,
        "react-reconciler-constants-shim.js",
      ),
      "@tscircuit/core/node_modules/react-reconciler/constants.js": resolve(
        __dirname,
        "react-reconciler-constants-shim.js",
      ),
      "tscircuit/node_modules/react-reconciler": resolve(
        __dirname,
        "react-reconciler-shim.js",
      ),
      "tscircuit/node_modules/react-reconciler/index.js": resolve(
        __dirname,
        "react-reconciler-shim.js",
      ),
      "tscircuit/node_modules/react-reconciler/constants": resolve(
        __dirname,
        "react-reconciler-constants-shim.js",
      ),
      "tscircuit/node_modules/react-reconciler/constants.js": resolve(
        __dirname,
        "react-reconciler-constants-shim.js",
      ),
      "@tscircuit/core/node_modules/react-reconciler": resolve(
        __dirname,
        "react-reconciler-shim.js",
      ),
      "@tscircuit/core/node_modules/react-reconciler/index.js": resolve(
        __dirname,
        "react-reconciler-shim.js",
      ),
      "@tscircuit/core/node_modules/react-reconciler/constants": resolve(
        __dirname,
        "react-reconciler-constants-shim.js",
      ),
      "@tscircuit/core/node_modules/react-reconciler/constants.js": resolve(
        __dirname,
        "react-reconciler-constants-shim.js",
      ),
      "/node_modules/tscircuit/node_modules/react-reconciler": resolve(
        __dirname,
        "react-reconciler-shim.js",
      ),
      "/node_modules/tscircuit/node_modules/react-reconciler/index.js": resolve(
        __dirname,
        "react-reconciler-shim.js",
      ),
      "/node_modules/tscircuit/node_modules/react-reconciler/constants":
        resolve(__dirname, "react-reconciler-constants-shim.js"),
      "/node_modules/tscircuit/node_modules/react-reconciler/constants.js":
        resolve(__dirname, "react-reconciler-constants-shim.js"),
      "/node_modules/@tscircuit/core/dist/index.js": resolve(
        __dirname,
        "node_modules/@tscircuit/core/dist/index.js",
      ),
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
    exclude: [
      "@tscircuit/eval",
      "@tscircuit/core",
      "tscircuit",
      "react-cosmos",
      "react-cosmos-plugin-vite",
    ],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
  },
})
