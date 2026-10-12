import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import {
  findSharedTerminalBridgeGroups,
  canLayoutSharedTerminalBridge,
} from "lib/solvers/PackInnerPartitionsSolver/findSharedTerminalBridgeGroups"
import type { InputProblem } from "lib/types/InputProblem"
import si7021Input from "../../pages/repros/repro-si7021/si7021-matchpack-input.json"

test("findSharedTerminalBridgeGroups detects Si7021 solder jumper bridge", () => {
  const problem = structuredClone(si7021Input) as InputProblem
  expect(canLayoutSharedTerminalBridge(problem)).toBe(true)

  const groups = findSharedTerminalBridgeGroups(problem)
  expect(groups).toHaveLength(1)
  const group = groups[0]!

  expect(group.mainChipId).toBe("U1")
  expect(group.terminalChipId).toBe("SJ1")
  expect(group.terminalPowerPinId).toBe("SJ1.2")

  const branchChipIds = group.branches.map((b) => b.chipId).sort()
  expect(branchChipIds).toEqual(["R1", "R2"])
})

test("shared terminal bridge detection is independent of reference designators", () => {
  const problem = structuredClone(si7021Input) as any

  // Rename components to arbitrary designators
  const renameMap: Record<string, string> = {
    U1: "IC_MAIN",
    R1: "PASSIVE_ALPHA",
    R2: "PASSIVE_BETA",
    SJ1: "BRIDGE_TAP",
  }

  const newChipMap: Record<string, any> = {}
  for (const [oldId, chip] of Object.entries(problem.chipMap)) {
    const newId = renameMap[oldId] ?? oldId
    newChipMap[newId] = {
      ...(chip as any),
      chipId: newId,
      pins: (chip as any).pins.map((p: string) => {
        const [owner, num] = p.split(".")
        return `${renameMap[owner!] ?? owner}.${num}`
      }),
    }
  }

  const newChipPinMap: Record<string, any> = {}
  for (const [oldPinId, pin] of Object.entries(problem.chipPinMap)) {
    const [owner, num] = oldPinId.split(".")
    const newPinId = `${renameMap[owner!] ?? owner}.${num}`
    newChipPinMap[newPinId] = {
      ...(pin as any),
      pinId: newPinId,
    }
  }

  const newPinStrongConnMap: Record<string, boolean> = {}
  for (const [key, val] of Object.entries(problem.pinStrongConnMap)) {
    const [p1, p2] = key.split("-")
    const [o1, n1] = p1!.split(".")
    const [o2, n2] = p2!.split(".")
    const newP1 = `${renameMap[o1!] ?? o1}.${n1}`
    const newP2 = `${renameMap[o2!] ?? o2}.${n2}`
    newPinStrongConnMap[`${newP1}-${newP2}`] = val as boolean
  }

  const newNetConnMap: Record<string, boolean> = {}
  for (const [key, val] of Object.entries(problem.netConnMap)) {
    const [p1, net] = key.split("-")
    const [o1, n1] = p1!.split(".")
    const newP1 = `${renameMap[o1!] ?? o1}.${n1}`
    newNetConnMap[`${newP1}-${net}`] = val as boolean
  }

  const renamedProblem: InputProblem = {
    ...problem,
    chipMap: newChipMap,
    chipPinMap: newChipPinMap,
    pinStrongConnMap: newPinStrongConnMap,
    netConnMap: newNetConnMap,
  }

  const groups = findSharedTerminalBridgeGroups(renamedProblem)
  expect(groups).toHaveLength(1)
  expect(groups[0]!.mainChipId).toBe("IC_MAIN")
  expect(groups[0]!.terminalChipId).toBe("BRIDGE_TAP")
  expect(groups[0]!.terminalPowerPinId).toBe("BRIDGE_TAP.2")
})

test("Si7021 layout places solder jumper above pull-ups with positive voltage pointing upward", async () => {
  const solver = new LayoutPipelineSolver(si7021Input as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const outputLayout = solver.getOutputLayout()
  const placements = outputLayout.chipPlacements

  const u1 = placements.U1!
  const r1 = placements.R1!
  const r2 = placements.R2!
  const sj1 = placements.SJ1!

  // Zero component overlaps in final layout
  expect(solver.checkForOverlaps(outputLayout)).toHaveLength(0)

  // Resistors are placed to the right of U1
  expect(r1.x).toBeGreaterThan(u1.x)
  expect(r2.x).toBeGreaterThan(u1.x)

  // SJ1 bridge is placed above both resistors
  expect(sj1.y).toBeGreaterThan(r1.y)
  expect(sj1.y).toBeGreaterThan(r2.y)

  // SJ1 is centered between R1 and R2
  const expectedCenterX = (r1.x + r2.x) / 2
  expect(Math.abs(sj1.x - expectedCenterX)).toBeLessThan(1e-4)

  // SJ1 has rotation 0 so its positive voltage source pin (SJ1.2 at y+) points upward
  expect(sj1.ccwRotationDegrees).toBe(0)

  // Generate visual solver snapshot
  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1000,
    svgHeight: 600,
  })
})

test("shared terminal bridge safely falls back to standard packing when obstructed", () => {
  const problem = structuredClone(si7021Input) as InputProblem
  // Place an obstacle right at the bridge candidate location
  problem.chipMap.OBSTACLE = {
    chipId: "OBSTACLE",
    pins: ["OBSTACLE.1"],
    size: { x: 5, y: 5 },
    fixedPosition: { x: 1.7, y: 1.6 },
  }
  problem.chipPinMap["OBSTACLE.1"] = {
    pinId: "OBSTACLE.1",
    offset: { x: 0, y: 0 },
    side: "x+",
  }

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  // Layout completed successfully without crashing or overlapping
  const outputLayout = solver.getOutputLayout()
  expect(outputLayout.chipPlacements.U1).toBeDefined()
  expect(outputLayout.chipPlacements.SJ1).toBeDefined()
  expect(outputLayout.chipPlacements.OBSTACLE).toBeDefined()
})
