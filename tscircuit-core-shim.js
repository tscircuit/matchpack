// Minimal shim to avoid deep react-reconciler dependency path issues in Vite.
// This is used for Cosmos / local prototyping only.

const missing = new Proxy(
  {},
  {
    get: () => {
      return () => {
        console.warn("@tscircuit/core shim called, returning no-op.")
        return undefined
      }
    },
  },
)

export default missing
export const LayoutPipelineSolver = missing
export const InputProblem = missing
export const OutputLayout = missing
export const PackedPartition = missing

export * from "@tscircuit/core"
