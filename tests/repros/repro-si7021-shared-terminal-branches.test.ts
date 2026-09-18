import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { findSharedTerminalBranchGroups } from "lib/solvers/PackInnerPartitionsSolver/findSharedTerminalBranchGroups"
import { layoutSharedTerminalBranchGroup } from "lib/solvers/PackInnerPartitionsSolver/layoutSharedTerminalBranchGroup"
import type { InputProblem, PinId } from "lib/types/InputProblem"
import type { Placement } from "lib/types/OutputLayout"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import inputProblem from "../../pages/repros/repro-si7021/si7021-matchpack-input.json"

const problem = inputProblem as InputProblem
const cloneProblem = (): InputProblem => structuredClone(problem)

const getPinPosition = (
  layout: ReturnType<LayoutPipelineSolver["getOutputLayout"]>,
  chipId: string,
  pinId: string,
  sourceProblem: InputProblem = problem,
) => {
  const placement = layout.chipPlacements[chipId]!
  const pin = sourceProblem.chipPinMap[pinId]!
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

const solveWithoutOverlaps = (sourceProblem: InputProblem) => {
  const solver = new LayoutPipelineSolver(sourceProblem)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.checkForOverlaps(solver.getOutputLayout())).toHaveLength(0)
  return solver
}

const renameProblem = (sourceProblem: InputProblem): InputProblem => {
  const chipNames: Record<string, string> = {
    U1: "MAIN_A",
    C2: "AUX_A",
    R1: "BRANCH_A",
    R2: "BRANCH_B",
    SJ1: "TERMINAL_A",
  }
  const pinNames = new Map<PinId, PinId>()

  for (const chip of Object.values(sourceProblem.chipMap)) {
    const renamedChipId = chipNames[chip.chipId] ?? chip.chipId
    for (const pinId of chip.pins) {
      const suffix = pinId.slice(chip.chipId.length)
      pinNames.set(pinId, `${renamedChipId}${suffix}`)
    }
  }

  const renamePin = (pinId: PinId): PinId => pinNames.get(pinId) ?? pinId
  const renamed = structuredClone(sourceProblem)

  renamed.chipMap = Object.fromEntries(
    Object.values(sourceProblem.chipMap).map((chip) => {
      const chipId = chipNames[chip.chipId] ?? chip.chipId
      return [
        chipId,
        {
          ...structuredClone(chip),
          chipId,
          pins: chip.pins.map(renamePin),
        },
      ]
    }),
  )

  renamed.chipPinMap = Object.fromEntries(
    Object.values(sourceProblem.chipPinMap).map((pin) => {
      const pinId = renamePin(pin.pinId)
      return [pinId, { ...structuredClone(pin), pinId }]
    }),
  )

  renamed.pinStrongConnMap = Object.fromEntries(
    Object.entries(sourceProblem.pinStrongConnMap).map(([key, value]) => {
      const [left, right] = key.split("-") as [PinId, PinId]
      return [`${renamePin(left)}-${renamePin(right)}`, value]
    }),
  ) as InputProblem["pinStrongConnMap"]

  renamed.netConnMap = Object.fromEntries(
    Object.entries(sourceProblem.netConnMap).map(([key, value]) => {
      const separator = key.indexOf("-")
      const left = key.slice(0, separator) as PinId
      const right = key.slice(separator + 1)
      return [`${renamePin(left)}-${right}`, value]
    }),
  ) as InputProblem["netConnMap"]

  return renamed
}

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

test("detection is independent of reference designators", () => {
  const renamed = renameProblem(problem)
  const groups = findSharedTerminalBranchGroups(renamed)
  expect(groups).toHaveLength(1)
  expect(groups[0]?.mainChipId).toBe("MAIN_A")
  expect(groups[0]?.terminalChipId).toBe("TERMINAL_A")
  expect(groups[0]?.branches.map((branch) => branch.chipId).sort()).toEqual([
    "BRANCH_A",
    "BRANCH_B",
  ])
  solveWithoutOverlaps(renamed)
})

test("rejects unsafe or incomplete shared-terminal candidates", () => {
  const fixedBranch = cloneProblem()
  fixedBranch.chipMap.R1!.fixedPosition = { x: 10, y: 10 }
  expect(findSharedTerminalBranchGroups(fixedBranch)).toHaveLength(0)

  const fixedTerminal = cloneProblem()
  fixedTerminal.chipMap.SJ1!.fixedPosition = { x: 10, y: 10 }
  expect(findSharedTerminalBranchGroups(fixedTerminal)).toHaveLength(0)

  const missingRail = cloneProblem()
  delete missingRail.netConnMap["SJ1.2-V3_3"]
  expect(findSharedTerminalBranchGroups(missingRail)).toHaveLength(0)

  const extraStrongConnection = cloneProblem()
  ;(extraStrongConnection.pinStrongConnMap as Record<string, boolean>)[
    "SJ1.2-C2.1"
  ] = true
  expect(findSharedTerminalBranchGroups(extraStrongConnection)).toHaveLength(0)
})

test("falls back when an unrelated component blocks the refinement", () => {
  const clearProblem = cloneProblem()
  const group = findSharedTerminalBranchGroups(clearProblem)[0]!
  const basePlacements: Record<string, Placement> = {
    U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
    C2: { x: -2.03, y: 0, ccwRotationDegrees: 90 },
    R1: { x: 3, y: 2, ccwRotationDegrees: 0 },
    R2: { x: 3, y: -2, ccwRotationDegrees: 0 },
    SJ1: { x: 4, y: 0, ccwRotationDegrees: 0 },
  }

  expect(
    layoutSharedTerminalBranchGroup({
      group,
      chipPlacements: basePlacements,
      inputProblem: clearProblem,
    }),
  ).not.toBeNull()

  const blockedProblem = cloneProblem()
  blockedProblem.chipMap.BLOCK = {
    chipId: "BLOCK",
    pins: [],
    size: { x: 1, y: 1 },
    fixedPosition: { x: 1.5, y: 0 },
  }
  const blockedPlacements = {
    ...basePlacements,
    BLOCK: { x: 1.5, y: 0, ccwRotationDegrees: 0 },
  }

  expect(
    layoutSharedTerminalBranchGroup({
      group: findSharedTerminalBranchGroups(blockedProblem)[0]!,
      chipPlacements: blockedPlacements,
      inputProblem: blockedProblem,
    }),
  ).toBeNull()
})

test("supports every fixed quarter-turn anchor rotation", () => {
  for (const rotation of [0, 90, 180, 270] as const) {
    const rotated = cloneProblem()
    rotated.chipMap.U1!.availableRotations = [rotation]
    expect(findSharedTerminalBranchGroups(rotated)).toHaveLength(1)
    solveWithoutOverlaps(rotated)
  }
})

test("honors restricted branch rotations", () => {
  const restricted = cloneProblem()
  restricted.chipMap.R1!.availableRotations = [90]
  restricted.chipMap.R2!.availableRotations = [90]
  const solver = solveWithoutOverlaps(restricted)
  const layout = solver.getOutputLayout()
  expect(layout.chipPlacements.R1?.ccwRotationDegrees).toBe(90)
  expect(layout.chipPlacements.R2?.ccwRotationDegrees).toBe(90)
})

test("reflows SI7021 branches into a compact deterministic layout", async () => {
  const originalProblem = JSON.stringify(inputProblem)
  const solver = solveWithoutOverlaps(problem)

  expect(
    solver.packInnerPartitionsSolver?.completedSolvers.some(
      (completedSolver) =>
        completedSolver.constructor.name === "SharedTerminalBranchSolver",
    ),
  ).toBe(true)

  const layout = solver.getOutputLayout()
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

  const secondSolver = solveWithoutOverlaps(problem)
  const secondLayout = secondSolver.getOutputLayout()
  for (const chipId of ["R1", "R2", "SJ1"] as const) {
    expect(secondLayout.chipPlacements[chipId]).toEqual(
      layout.chipPlacements[chipId],
    )
  }

  expect(JSON.stringify(inputProblem)).toBe(originalProblem)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgName: "shared-terminal",
    svgWidth: 600,
    svgHeight: 600,
  })
})
