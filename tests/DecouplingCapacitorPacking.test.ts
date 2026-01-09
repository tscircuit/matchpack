import { test, expect } from "bun:test"
import { LayoutPipelineSolver } from "../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { problem } from "./DecouplingCapacitorPacking_data"

test("Reproduction Issue 15: Check decoupling capacitor layout", () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)

  const layout = solver.getOutputLayout()

  const decapSolver = solver.identifyDecouplingCapsSolver
  expect(decapSolver).toBeDefined()
  expect(decapSolver!.outputDecouplingCapGroups.length).toBeGreaterThan(0)

  for (const group of decapSolver!.outputDecouplingCapGroups) {
    // Verify all capacitors have placements
    const positions = group.decouplingCapChipIds.map((id) => {
      const p = layout.chipPlacements[id]
      if (!p) throw new Error(`Missing placement for ${id}`)
      return { id, x: p.x, y: p.y, r: p.ccwRotationDegrees }
    })

    // Verify linear arrangement (all same Y for horizontal row)
    const ys = new Set(positions.map((p) => p.y.toFixed(3)))
    expect(ys.size).toBe(1) // All capacitors should have same Y coordinate
  }
})
