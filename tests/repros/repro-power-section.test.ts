import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import inputProblem from "../assets/repro-power-section.input.json"

test("power section schematic auto-layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as InputProblem)
  solver.solve()

  const layout = solver.getOutputLayout()
  const c4 = layout.chipPlacements.C4!
  const r1 = layout.chipPlacements.R1!
  const led1 = layout.chipPlacements.LED1!
  const c4RailPinOffset = rotatePinOffset(
    inputProblem.chipPinMap["C4.1"]!.offset,
    c4.ccwRotationDegrees,
  )
  const r1RailPinOffset = rotatePinOffset(
    inputProblem.chipPinMap["R1.1"]!.offset,
    r1.ccwRotationDegrees,
  )
  const seriesPartition = solver.chipPartitions!.find(
    (partition) => partition.chipMap.R1,
  )!

  expect(Object.keys(seriesPartition.chipMap).sort()).toEqual(["LED1", "R1"])
  expect(r1.x).toBeGreaterThan(c4.x)
  expect(r1.y + r1RailPinOffset.y).toBe(c4.y + c4RailPinOffset.y)
  expect(led1.x).toBe(r1.x)
  expect(r1.y - led1.y).toBeCloseTo(1.54)
  expect(solver.checkForOverlaps(layout)).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
