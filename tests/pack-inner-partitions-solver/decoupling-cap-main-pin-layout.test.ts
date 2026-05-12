import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type {
  ChipPin,
  PartitionInputProblem,
  PinId,
} from "../../lib/types/InputProblem"

const makeDecouplingCapPartition = (): PartitionInputProblem => ({
  chipMap: {
    C10: {
      chipId: "C10",
      pins: ["C10.1", "C10.2"],
      size: { x: 1, y: 0.5 },
      availableRotations: [0],
    },
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 1, y: 0.5 },
      availableRotations: [0],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 1, y: 0.5 },
      availableRotations: [0],
    },
  },
  chipPinMap: {
    "C10.1": { pinId: "C10.1", offset: { x: 0, y: 0.25 }, side: "y+" },
    "C10.2": { pinId: "C10.2", offset: { x: 0, y: -0.25 }, side: "y-" },
    "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.25 }, side: "y+" },
    "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.25 }, side: "y-" },
    "C2.1": { pinId: "C2.1", offset: { x: 0, y: 0.25 }, side: "y+" },
    "C2.2": { pinId: "C2.2", offset: { x: 0, y: -0.25 }, side: "y-" },
  },
  netMap: {
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
    GND: { netId: "GND", isGround: true },
  },
  pinStrongConnMap: {},
  netConnMap: {
    "C10.1-VCC": true,
    "C10.2-GND": true,
    "C1.1-VCC": true,
    "C1.2-GND": true,
    "C2.1-VCC": true,
    "C2.2-GND": true,
  },
  chipGap: 0.6,
  decouplingCapsGap: 0.25,
  partitionGap: 1.2,
  isPartition: true,
  partitionType: "decoupling_caps",
})

const makeMainPin = (
  pinId: PinId,
  offset: { x: number; y: number },
  side: ChipPin["side"],
): ChipPin => ({
  pinId,
  offset,
  side,
})

test("decoupling caps connected to x-side main pins are stacked by main pin y order", () => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: makeDecouplingCapPartition(),
    pinIdToStronglyConnectedPins: {
      "C10.1": [makeMainPin("U1.10", { x: 2, y: 2 }, "x+")],
      "C1.1": [makeMainPin("U1.1", { x: 2, y: -2 }, "x+")],
      "C2.1": [makeMainPin("U1.2", { x: 2, y: 0 }, "x+")],
    },
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  const placements = solver.layout!.chipPlacements

  expect(placements.C1!.x).toBeCloseTo(0)
  expect(placements.C2!.x).toBeCloseTo(0)
  expect(placements.C10!.x).toBeCloseTo(0)
  expect(placements.C1!.y).toBeLessThan(placements.C2!.y)
  expect(placements.C2!.y).toBeLessThan(placements.C10!.y)
})

test("decoupling caps connected to y-side main pins are laid out by main pin x order", () => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: makeDecouplingCapPartition(),
    pinIdToStronglyConnectedPins: {
      "C10.1": [makeMainPin("U1.10", { x: 2, y: 2 }, "y+")],
      "C1.1": [makeMainPin("U1.1", { x: -2, y: 2 }, "y+")],
      "C2.1": [makeMainPin("U1.2", { x: 0, y: 2 }, "y+")],
    },
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  const placements = solver.layout!.chipPlacements

  expect(placements.C1!.y).toBeCloseTo(0)
  expect(placements.C2!.y).toBeCloseTo(0)
  expect(placements.C10!.y).toBeCloseTo(0)
  expect(placements.C1!.x).toBeLessThan(placements.C2!.x)
  expect(placements.C2!.x).toBeLessThan(placements.C10!.x)
})

test("decoupling cap spacing includes pin envelope beyond the chip body", () => {
  const partition = makeDecouplingCapPartition()
  partition.chipMap = {
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 0.2, y: 0.2 },
      availableRotations: [0],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 0.2, y: 0.2 },
      availableRotations: [0],
    },
  }
  partition.chipPinMap = {
    "C1.1": { pinId: "C1.1", offset: { x: -0.6, y: 0 }, side: "x-" },
    "C1.2": { pinId: "C1.2", offset: { x: 0.6, y: 0 }, side: "x+" },
    "C2.1": { pinId: "C2.1", offset: { x: -0.6, y: 0 }, side: "x-" },
    "C2.2": { pinId: "C2.2", offset: { x: 0.6, y: 0 }, side: "x+" },
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {
      "C1.1": [makeMainPin("U1.1", { x: -2, y: 2 }, "y+")],
      "C2.1": [makeMainPin("U1.2", { x: 2, y: 2 }, "y+")],
    },
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  const placements = solver.layout!.chipPlacements
  const centerDistance = Math.abs(placements.C2!.x - placements.C1!.x)

  expect(centerDistance).toBeCloseTo(1.55)
})

test("mixed x-side and y-side main pins keep side-aware order", () => {
  const partition = makeDecouplingCapPartition()
  partition.chipMap.C3 = {
    chipId: "C3",
    pins: ["C3.1", "C3.2"],
    size: { x: 1, y: 0.5 },
    availableRotations: [0],
  }
  partition.chipPinMap["C3.1"] = {
    pinId: "C3.1",
    offset: { x: 0, y: 0.25 },
    side: "y+",
  }
  partition.chipPinMap["C3.2"] = {
    pinId: "C3.2",
    offset: { x: 0, y: -0.25 },
    side: "y-",
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {
      "C10.1": [makeMainPin("U1.10", { x: 10, y: -2 }, "x+")],
      "C2.1": [makeMainPin("U1.2", { x: 10, y: 2 }, "x+")],
      "C1.1": [makeMainPin("U1.1", { x: -2, y: 10 }, "y+")],
      "C3.1": [makeMainPin("U1.3", { x: 2, y: 10 }, "y+")],
    },
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  const placements = solver.layout!.chipPlacements

  expect(placements.C10!.x).toBeLessThan(placements.C2!.x)
  expect(placements.C1!.x).toBeLessThan(placements.C3!.x)
})
