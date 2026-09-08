import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { findSameSidePassiveGroups } from "lib/solvers/PackInnerPartitionsSolver/findSameSidePassiveGroups"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import type { InputProblem } from "lib/types/InputProblem"
import input from "../../pages/repros/repro-si7021/si7021-matchpack-input.json"

for (const [rotation, side] of [
  [0, "x+"],
  [90, "y+"],
  [180, "x-"],
  [270, "y-"],
] as const) {
  test(`rail carrier respects off-center right-edge pins at ${rotation} degrees`, async () => {
    const problem = structuredClone(input) as InputProblem
    problem.chipMap.U1!.size.y = 6
    problem.chipMap.U1!.availableRotations = [rotation]
    problem.chipPinMap["U1.3"]!.offset.y = 2
    problem.chipPinMap["U1.4"]!.offset.y = 2.4
    const groups = findSameSidePassiveGroups(problem).filter(
      (group) => group.railCarrier,
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.side).toBe(side)
    const solver = new LayoutPipelineSolver(problem)
    solver.solve()
    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
    const layout = solver.getOutputLayout()
    expect(solver.checkForOverlaps(layout)).toEqual([])
    const placements = layout.chipPlacements
    const pos = (chipId: string, pinId: string) => {
      const placement = placements[chipId]!
      const offset = rotatePinOffset(
        problem.chipPinMap[pinId]!.offset,
        placement.ccwRotationDegrees,
      )
      return { x: placement.x + offset.x, y: placement.y + offset.y }
    }
    for (const [resistor, mainPin] of [
      ["R1", "U1.4"],
      ["R2", "U1.3"],
    ]) {
      const a = pos("U1", mainPin!)
      const b = pos(resistor!, `${resistor}.1`)
      const axis = rotation === 0 || rotation === 180 ? "y" : "x"
      expect(Math.abs(a[axis] - b[axis])).toBeLessThan(1e-6)
    }
    if (rotation === 0) {
      await expect(solver).toMatchSolverSnapshot(import.meta.path, {
        svgName: "tall-chip-rail-carrier",
        svgWidth: 1000,
        svgHeight: 700,
      })
    }
  })
}

test("SI7021 fixture has a reviewable final layout", async () => {
  const solver = new LayoutPipelineSolver(
    structuredClone(input) as InputProblem,
  )
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.checkForOverlaps(solver.getOutputLayout())).toEqual([])
  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgName: "si7021-rail-carrier",
    svgWidth: 1000,
    svgHeight: 700,
  })
})
