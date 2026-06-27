import { test, expect } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { problem } from "../../pages/LayoutPipelineSolver/LayoutPipelineSolver06.page.tsx"

test("LayoutPipelineSolver06 - runs pipeline with decoupling capacitors", () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const finalLayout = solver.getOutputLayout()
  expect(finalLayout).toBeDefined()

  // Save output snapshot or print details
  console.log("Final layout placements:")
  for (const [chipId, placement] of Object.entries(
    finalLayout.chipPlacements,
  )) {
    console.log(
      `  ${chipId}: x=${placement.x.toFixed(2)}, y=${placement.y.toFixed(2)}, rotation=${placement.ccwRotationDegrees}`,
    )
  }
})
