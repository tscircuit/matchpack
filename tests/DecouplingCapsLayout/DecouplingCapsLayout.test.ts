import { test, expect } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"

function makeDecouplingCapsPartition(
  chipCount: number,
  opts?: { decouplingCapsGap?: number; chipGap?: number },
): PartitionInputProblem {
  const chipMap: Record<string, any> = {}
  const chipPinMap: Record<string, any> = {}
  const netConnMap: Record<string, boolean> = {}
  const pinStrongConnMap: Record<string, boolean> = {}

  for (let i = 1; i <= chipCount; i++) {
    const chipId = `C${i}`
    const pinTop = `${chipId}.1`
    const pinBot = `${chipId}.2`

    chipMap[chipId] = {
      chipId,
      pins: [pinTop, pinBot],
      size: { x: 0.5, y: 1.0 },
      isDecouplingCap: true,
      availableRotations: [0, 180],
    }

    chipPinMap[pinTop] = { pinId: pinTop, offset: { x: 0, y: 0.4 }, side: "y+" }
    chipPinMap[pinBot] = {
      pinId: pinBot,
      offset: { x: 0, y: -0.4 },
      side: "y-",
    }

    netConnMap[`${pinTop}-VCC`] = true
    netConnMap[`${pinBot}-GND`] = true
  }

  return {
    chipMap,
    chipPinMap,
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap,
    netConnMap,
    chipGap: opts?.chipGap ?? 0.2,
    partitionGap: 1.0,
    decouplingCapsGap: opts?.decouplingCapsGap,
    isPartition: true,
    partitionType: "decoupling_caps",
  }
}

test("decoupling caps are placed in a horizontal row at y=0", () => {
  const partition = makeDecouplingCapsPartition(5)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout).not.toBeNull()

  const placements = solver.layout!.chipPlacements
  expect(Object.keys(placements)).toHaveLength(5)

  for (const [, placement] of Object.entries(placements)) {
    expect(placement.y).toBe(0)
  }
})

test("decoupling caps are sorted by chipId for deterministic output", () => {
  const partition = makeDecouplingCapsPartition(4)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  const placements = solver.layout!.chipPlacements
  const sortedIds = Object.keys(placements).sort((a, b) => a.localeCompare(b))
  const xPositions = sortedIds.map((id) => placements[id]!.x)

  for (let i = 1; i < xPositions.length; i++) {
    expect(xPositions[i]!).toBeGreaterThan(xPositions[i - 1]!)
  }
})

test("decoupling cap row is centered at x=0", () => {
  const partition = makeDecouplingCapsPartition(3)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  const placements = solver.layout!.chipPlacements
  const xPositions = Object.values(placements).map((p) => p.x)
  const minX = Math.min(...xPositions)
  const maxX = Math.max(...xPositions)
  const centerX = (minX + maxX) / 2

  expect(Math.abs(centerX)).toBeLessThan(0.01)
})

test("gap between adjacent caps matches decouplingCapsGap", () => {
  const gap = 0.3
  const partition = makeDecouplingCapsPartition(3, { decouplingCapsGap: gap })
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  const placements = solver.layout!.chipPlacements
  const sortedIds = Object.keys(placements).sort((a, b) => a.localeCompare(b))

  for (let i = 1; i < sortedIds.length; i++) {
    const prev = placements[sortedIds[i - 1]!]!
    const curr = placements[sortedIds[i]!]!
    const chipWidth = 0.5
    const actualGap = curr.x - prev.x - chipWidth
    expect(Math.abs(actualGap - gap)).toBeLessThan(0.01)
  }
})

test("single decoupling cap is placed at origin", () => {
  const partition = makeDecouplingCapsPartition(1)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  const placements = solver.layout!.chipPlacements
  expect(Object.keys(placements)).toHaveLength(1)
  const placement = Object.values(placements)[0]!
  expect(placement.x).toBe(0)
  expect(placement.y).toBe(0)
  expect(placement.ccwRotationDegrees).toBe(0)
})

test("all decoupling caps have rotation 0", () => {
  const partition = makeDecouplingCapsPartition(6)
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  for (const placement of Object.values(solver.layout!.chipPlacements)) {
    expect(placement.ccwRotationDegrees).toBe(0)
  }
})
