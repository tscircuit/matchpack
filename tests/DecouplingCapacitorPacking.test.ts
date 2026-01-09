import { test, expect } from "bun:test"
import { LayoutPipelineSolver } from "../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { problem } from "./DecouplingCapacitorPacking_data"

test("Reproduction Issue 15: Check decoupling capacitor layout", () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)

  const layout = solver.getOutputLayout()

  console.log("Decoupling Cap Groups identified:")
  const decapSolver = solver.identifyDecouplingCapsSolver
  if (decapSolver && decapSolver.outputDecouplingCapGroups) {
    for (const group of decapSolver.outputDecouplingCapGroups) {
      console.log(`Group: ${group.decouplingCapGroupId}`)
      console.log(`  Main Chip: ${group.mainChipId}`)
      console.log(`  Caps: ${group.decouplingCapChipIds.join(", ")}`)

      // Check positions of caps
      const positions = group.decouplingCapChipIds.map((id) => {
        const p = layout.chipPlacements[id]
        return { id, x: p.x, y: p.y, r: p.ccwRotationDegrees }
      })

      console.log("  Positions:", JSON.stringify(positions, null, 2))

      // Analyze for linearity (all same X or all same Y)
      const xs = new Set(positions.map((p) => p.x.toFixed(3)))
      const ys = new Set(positions.map((p) => p.y.toFixed(3)))

      console.log(`  Unique X coords: ${xs.size}`)
      console.log(`  Unique Y coords: ${ys.size}`)

      // Ideally for a row, one of these should be small (ideally 1 if perfectly aligned, but maybe slightly offset due to packing)
      // Check if they are neatly arranged.
    }
  } else {
    console.log("No decoupling caps found!")
  }
})
