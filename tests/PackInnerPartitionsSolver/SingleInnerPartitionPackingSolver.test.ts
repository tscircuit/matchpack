import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type {
  ChipId,
  ChipPin,
  NetId,
  PartitionInputProblem,
  PinId,
} from "lib/types/InputProblem"

const makeCap = (chipId: ChipId) => ({
  chipId,
  pins: [`${chipId}.1`, `${chipId}.2`],
  size: { x: 0.53, y: 1.06 },
  availableRotations: [0] as Array<0 | 90 | 180 | 270>,
})

const makeCapPinMap = (chipIds: ChipId[]) => {
  const chipPinMap: Record<PinId, ChipPin> = {}

  for (const chipId of chipIds) {
    chipPinMap[`${chipId}.1`] = {
      pinId: `${chipId}.1`,
      offset: { x: 0, y: 0.53 },
      side: "y+",
    }
    chipPinMap[`${chipId}.2`] = {
      pinId: `${chipId}.2`,
      offset: { x: 0, y: -0.53 },
      side: "y-",
    }
  }

  return chipPinMap
}

const makeDecouplingCapPartition = (
  chipIds: ChipId[],
): PartitionInputProblem => {
  const chipMap = Object.fromEntries(
    chipIds.map((chipId) => [chipId, makeCap(chipId)]),
  )
  const netConnMap: Record<`${PinId}-${NetId}`, boolean> = {}

  for (const chipId of chipIds) {
    netConnMap[`${chipId}.1-VCC`] = true
    netConnMap[`${chipId}.2-GND`] = true
  }

  return {
    chipMap,
    chipPinMap: makeCapPinMap(chipIds),
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap,
    chipGap: 0.6,
    decouplingCapsGap: 0.2,
    partitionGap: 1.2,
    isPartition: true,
    partitionType: "decoupling_caps",
  }
}

test("SingleInnerPartitionPackingSolver creates a vertical decoupling capacitor column ordered by main-chip pins", () => {
  const partitionInputProblem = makeDecouplingCapPartition([
    "C_LOW",
    "C_TOP",
    "C_MID",
  ])
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: {
      "C_TOP.1": [{ pinId: "U1.1", offset: { x: -2, y: 2 }, side: "x-" }],
      "C_MID.1": [{ pinId: "U1.2", offset: { x: -2, y: 0 }, side: "x-" }],
      "C_LOW.1": [{ pinId: "U1.3", offset: { x: -2, y: -2 }, side: "x-" }],
    },
  })

  solver.solve()

  expect(solver.failed).toBe(false)
  expect(solver.layout).not.toBeNull()

  const placements = solver.layout!.chipPlacements
  expect(placements.C_TOP!.y).toBeGreaterThan(placements.C_MID!.y)
  expect(placements.C_MID!.y).toBeGreaterThan(placements.C_LOW!.y)
  expect(placements.C_TOP!.x).toBeCloseTo(0, 6)
  expect(placements.C_MID!.x).toBeCloseTo(0, 6)
  expect(placements.C_LOW!.x).toBeCloseTo(0, 6)
  expect(placements.C_TOP!.y - placements.C_MID!.y).toBeCloseTo(1.26, 6)
  expect(placements.C_MID!.y - placements.C_LOW!.y).toBeCloseTo(1.26, 6)
})

test("SingleInnerPartitionPackingSolver creates a horizontal decoupling capacitor row for y-side main-chip pins", () => {
  const partitionInputProblem = makeDecouplingCapPartition([
    "C_RIGHT",
    "C_LEFT",
    "C_CENTER",
  ])
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem,
    pinIdToStronglyConnectedPins: {
      "C_LEFT.1": [{ pinId: "U1.1", offset: { x: -2, y: 2 }, side: "y+" }],
      "C_CENTER.1": [{ pinId: "U1.2", offset: { x: 0, y: 2 }, side: "y+" }],
      "C_RIGHT.1": [{ pinId: "U1.3", offset: { x: 2, y: 2 }, side: "y+" }],
    },
  })

  solver.solve()

  expect(solver.failed).toBe(false)
  expect(solver.layout).not.toBeNull()

  const placements = solver.layout!.chipPlacements
  expect(placements.C_LEFT!.x).toBeLessThan(placements.C_CENTER!.x)
  expect(placements.C_CENTER!.x).toBeLessThan(placements.C_RIGHT!.x)
  expect(placements.C_LEFT!.y).toBeCloseTo(0, 6)
  expect(placements.C_CENTER!.y).toBeCloseTo(0, 6)
  expect(placements.C_RIGHT!.y).toBeCloseTo(0, 6)
  expect(placements.C_CENTER!.x - placements.C_LEFT!.x).toBeCloseTo(0.73, 6)
  expect(placements.C_RIGHT!.x - placements.C_CENTER!.x).toBeCloseTo(0.73, 6)
})
