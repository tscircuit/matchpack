import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/repro-tall-growing-schematic.input.json"

test("reproduces tall-growing schematic from distant groups", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  await expect(solver).toMatchSolverSnapshot(import.meta.path)

  const layout = solver.getOutputLayout()
  const bounds = Object.entries(layout.chipPlacements).reduce(
    (acc, [chipId, placement]) => {
      const chip = (input as InputProblem).chipMap[chipId]!
      const rotated = [90, 270].includes(placement.ccwRotationDegrees ?? 0)
      const width = rotated ? chip.size.y : chip.size.x
      const height = rotated ? chip.size.x : chip.size.y
      acc.minX = Math.min(acc.minX, placement.x - width / 2)
      acc.maxX = Math.max(acc.maxX, placement.x + width / 2)
      acc.minY = Math.min(acc.minY, placement.y - height / 2)
      acc.maxY = Math.max(acc.maxY, placement.y + height / 2)
      return acc
    },
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  )

  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  expect(width / height).toBeGreaterThanOrEqual(4 / 3)
})
