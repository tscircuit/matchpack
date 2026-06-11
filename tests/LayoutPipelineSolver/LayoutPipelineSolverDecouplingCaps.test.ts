import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { problem } from "../../pages/LayoutPipelineSolver/LayoutPipelineSolver06.page"

test("decoupling capacitor groups are placed in side columns near their main chip", () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  const layout = solver.getOutputLayout()
  const mainChip = layout.chipPlacements.U3!
  const v33Caps = ["C12", "C14", "C8", "C13", "C15", "C19"]
  const v11Caps = ["C18", "C7"]

  for (const chipId of [...v33Caps, ...v11Caps]) {
    const placement = layout.chipPlacements[chipId]!
    expect(placement.x).toBeLessThan(mainChip.x)
    expect(Math.abs(placement.y - mainChip.y)).toBeLessThan(4)
  }

  const v33Xs = v33Caps.map((chipId) => layout.chipPlacements[chipId]!.x)
  const v33Ys = v33Caps.map((chipId) => layout.chipPlacements[chipId]!.y)
  expect(Math.max(...v33Xs) - Math.min(...v33Xs)).toBeLessThan(0.001)
  expect(Math.max(...v33Ys) - Math.min(...v33Ys)).toBeGreaterThan(5)

  const v11Xs = v11Caps.map((chipId) => layout.chipPlacements[chipId]!.x)
  expect(Math.max(...v11Xs) - Math.min(...v11Xs)).toBeLessThan(0.001)
  expect(v11Xs[0]!).toBeLessThan(v33Xs[0]!)

  expect(solver.checkForOverlaps(layout)).toHaveLength(0)
})
