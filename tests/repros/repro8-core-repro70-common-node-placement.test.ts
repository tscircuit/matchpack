import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import inputProblem from "../assets/repro-core-repro70-common-node-placement.input.json"

// Captured from @tscircuit/core's "matchpack-input-problem-*" debug output for
// repro70-schematicbox-rotation-autolayout. C1.1 is the common pin for the two
// strong connections FB1.2-C1.1 and C1.1-C3.1. C1/C3 are parallel passives on
// that common node, with their other pins on GND, so they should form a rail row
// anchored to FB1.pin2.
test("core repro70 aligns parallel passives on a shared strong node", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(
    solver.packInnerPartitionsSolver?.completedSolvers[0]?.constructor.name,
  ).toBe("ParallelAlignedPassiveSolver")

  const placements = solver.getOutputLayout().chipPlacements
  const { C1, C3, FB1 } = placements
  expect(C1!.y).toBeCloseTo(C3!.y)
  expect(C1!.x).not.toBeCloseTo(C3!.x)
  expect(Math.min(C1!.x, C3!.x)).toBeGreaterThan(FB1!.x)

  const getPinPosition = (chipId: "C1" | "C3" | "FB1", pinId: string) => {
    const placement = placements[chipId]!
    const offset = rotatePinOffset(
      (inputProblem as any).chipPinMap[pinId].offset,
      placement.ccwRotationDegrees,
    )
    return { x: placement.x + offset.x, y: placement.y + offset.y }
  }

  const fbOutput = getPinPosition("FB1", "FB1.2")
  const c1Common = getPinPosition("C1", "C1.1")
  const c3Common = getPinPosition("C3", "C3.1")
  expect(c1Common.y).toBeCloseTo(fbOutput.y)
  expect(c3Common.y).toBeCloseTo(fbOutput.y)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 600,
    svgHeight: 600,
  })
})
