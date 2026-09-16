import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { findSharedTerminalBranchGroups } from "lib/solvers/PackInnerPartitionsSolver/findSharedTerminalBranchGroups"
import type { InputProblem } from "lib/types/InputProblem"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import inputProblem from "../../pages/repros/repro-si7021/si7021-matchpack-input.json"

const problem = inputProblem as InputProblem

const getPinPosition = (
  layout: ReturnType<LayoutPipelineSolver["getOutputLayout"]>,
  chipId: string,
  pinId: string,
) => {
  const placement = layout.chipPlacements[chipId]!
  const pin = problem.chipPinMap[pinId]!
  const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
  return {
    x: placement.x + offset.x,
    y: placement.y + offset.y,
  }
}

const manhattan = (
  first: { x: number; y: number },
  second: { x: number; y: number },
) => Math.abs(first.x - second.x) + Math.abs(first.y - second.y)

const getSharedTerminalConnectionLength = (
  layout: ReturnType<LayoutPipelineSolver["getOutputLayout"]>,
) =>
  manhattan(
    getPinPosition(layout, "U1", "U1.4"),
    getPinPosition(layout, "R1", "R1.1"),
  ) +
  manhattan(
    getPinPosition(layout, "R1", "R1.2"),
    getPinPosition(layout, "SJ1", "SJ1.3"),
  ) +
  manhattan(
    getPinPosition(layout, "U1", "U1.3"),
    getPinPosition(layout, "R2", "R2.1"),
  ) +
  manhattan(
    getPinPosition(layout, "R2", "R2.2"),
    getPinPosition(layout, "SJ1", "SJ1.1"),
  )

test("detects the SI7021 shared-terminal branch topology", () => {
  const groups = findSharedTerminalBranchGroups(problem)
  expect(groups).toHaveLength(1)
  expect(groups[0]?.mainChipId).toBe("U1")
  expect(groups[0]?.terminalChipId).toBe("SJ1")
  expect(groups[0]?.branches.map((branch) => branch.chipId).sort()).toEqual([
    "R1",
    "R2",
  ])
})

test("reflows SI7021 branches into a compact deterministic layout", () => {
  const originalProblem = JSON.stringify(inputProblem)
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(
    solver.packInnerPartitionsSolver?.completedSolvers.some(
      (completedSolver) =>
        completedSolver.constructor.name === "SharedTerminalBranchSolver",
    ),
  ).toBe(true)

  const layout = solver.getOutputLayout()
  expect(solver.checkForOverlaps(layout)).toHaveLength(0)
  expect(getSharedTerminalConnectionLength(layout)).toBeLessThan(3)

  const mainPlacement = layout.chipPlacements.U1!
  const mainPinOffset = rotatePinOffset(
    problem.chipPinMap["U1.4"]!.offset,
    mainPlacement.ccwRotationDegrees,
  )
  const useX = Math.abs(mainPinOffset.x) >= Math.abs(mainPinOffset.y)
  const outwardSign = useX
    ? Math.sign(mainPinOffset.x)
    : Math.sign(mainPinOffset.y)
  const outwardCoordinate = (chipId: string) => {
    const placement = layout.chipPlacements[chipId]!
    return (useX ? placement.x : placement.y) * outwardSign
  }

  expect(outwardCoordinate("R1")).toBeGreaterThan(outwardCoordinate("U1"))
  expect(outwardCoordinate("R2")).toBeGreaterThan(outwardCoordinate("U1"))
  expect(outwardCoordinate("SJ1")).toBeGreaterThan(outwardCoordinate("R1"))
  expect(outwardCoordinate("SJ1")).toBeGreaterThan(outwardCoordinate("R2"))

  const secondSolver = new LayoutPipelineSolver(problem)
  secondSolver.solve()
  const secondLayout = secondSolver.getOutputLayout()
  for (const chipId of ["R1", "R2", "SJ1"] as const) {
    expect(secondLayout.chipPlacements[chipId]).toEqual(
      layout.chipPlacements[chipId],
    )
  }

  expect(JSON.stringify(inputProblem)).toBe(originalProblem)
})
