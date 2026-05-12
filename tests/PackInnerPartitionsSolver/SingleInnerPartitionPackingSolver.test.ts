import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type {
  ChipPin,
  PartitionInputProblem,
  PinId,
} from "../../lib/types/InputProblem"

const makeMainPin = (
  pinId: PinId,
  offset: { x: number; y: number },
  side: ChipPin["side"],
): ChipPin => ({
  pinId,
  offset,
  side,
})

const makeDecouplingCapPartition = (): PartitionInputProblem => ({
  chipMap: {
    C10: {
      chipId: "C10",
      pins: ["C10.VCC", "C10.GND"],
      size: { x: 1, y: 0.5 },
      availableRotations: [0],
    },
    C1: {
      chipId: "C1",
      pins: ["C1.VCC", "C1.GND"],
      size: { x: 1, y: 0.5 },
      availableRotations: [0],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.VCC", "C2.GND"],
      size: { x: 1, y: 0.5 },
      availableRotations: [0],
    },
  },
  chipPinMap: {
    "C10.VCC": { pinId: "C10.VCC", offset: { x: 0, y: 0.25 }, side: "y+" },
    "C10.GND": {
      pinId: "C10.GND",
      offset: { x: 0, y: -0.25 },
      side: "y-",
    },
    "C1.VCC": { pinId: "C1.VCC", offset: { x: 0, y: 0.25 }, side: "y+" },
    "C1.GND": { pinId: "C1.GND", offset: { x: 0, y: -0.25 }, side: "y-" },
    "C2.VCC": { pinId: "C2.VCC", offset: { x: 0, y: 0.25 }, side: "y+" },
    "C2.GND": { pinId: "C2.GND", offset: { x: 0, y: -0.25 }, side: "y-" },
  },
  netMap: {
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
    GND: { netId: "GND", isGround: true },
  },
  pinStrongConnMap: {},
  netConnMap: {
    "C10.VCC-VCC": true,
    "C10.GND-GND": true,
    "C1.VCC-VCC": true,
    "C1.GND-GND": true,
    "C2.VCC-VCC": true,
    "C2.GND-GND": true,
  },
  chipGap: 0.6,
  decouplingCapsGap: 0.25,
  partitionGap: 1.2,
  isPartition: true,
  partitionType: "decoupling_caps",
})

test("decoupling cap layout uses positive-voltage main pins for ordering", () => {
  const partition = makeDecouplingCapPartition()
  partition.chipMap = {
    C1: {
      chipId: "C1",
      pins: ["C1.GND", "C1.VCC"],
      size: { x: 1, y: 0.5 },
      availableRotations: [0],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.GND", "C2.VCC"],
      size: { x: 1, y: 0.5 },
      availableRotations: [0],
    },
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {
      "C1.GND": [makeMainPin("U1.GND1", { x: 2, y: 2 }, "y+")],
      "C1.VCC": [makeMainPin("U1.VCC1", { x: -2, y: 2 }, "y+")],
      "C2.GND": [makeMainPin("U1.GND2", { x: -2, y: 2 }, "y+")],
      "C2.VCC": [makeMainPin("U1.VCC2", { x: 2, y: 2 }, "y+")],
    },
  })

  solver.solve()

  const placements = solver.layout!.chipPlacements
  expect(placements.C1!.x).toBeLessThan(placements.C2!.x)
  expect(placements.C1!.y).toBeCloseTo(0)
  expect(placements.C2!.y).toBeCloseTo(0)
})

test("decoupling caps connected to x-side main pins are stacked by main pin y order", () => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: makeDecouplingCapPartition(),
    pinIdToStronglyConnectedPins: {
      "C10.VCC": [makeMainPin("U1.VCC10", { x: 2, y: 2 }, "x+")],
      "C1.VCC": [makeMainPin("U1.VCC1", { x: 2, y: -2 }, "x+")],
      "C2.VCC": [makeMainPin("U1.VCC2", { x: 2, y: 0 }, "x+")],
    },
  })

  solver.solve()

  const placements = solver.layout!.chipPlacements
  expect(placements.C1!.x).toBeCloseTo(0)
  expect(placements.C2!.x).toBeCloseTo(0)
  expect(placements.C10!.x).toBeCloseTo(0)
  expect(placements.C1!.y).toBeLessThan(placements.C2!.y)
  expect(placements.C2!.y).toBeLessThan(placements.C10!.y)
})

test("decoupling cap spacing includes the pin envelope beyond the chip body", () => {
  const partition = makeDecouplingCapPartition()
  partition.chipMap = {
    C1: {
      chipId: "C1",
      pins: ["C1.VCC", "C1.GND"],
      size: { x: 0.2, y: 0.2 },
      availableRotations: [0],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.VCC", "C2.GND"],
      size: { x: 0.2, y: 0.2 },
      availableRotations: [0],
    },
  }
  partition.chipPinMap = {
    "C1.VCC": { pinId: "C1.VCC", offset: { x: -0.6, y: 0 }, side: "x-" },
    "C1.GND": { pinId: "C1.GND", offset: { x: 0.6, y: 0 }, side: "x+" },
    "C2.VCC": { pinId: "C2.VCC", offset: { x: -0.6, y: 0 }, side: "x-" },
    "C2.GND": { pinId: "C2.GND", offset: { x: 0.6, y: 0 }, side: "x+" },
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {
      "C1.VCC": [makeMainPin("U1.VCC1", { x: -2, y: 2 }, "y+")],
      "C2.VCC": [makeMainPin("U1.VCC2", { x: 2, y: 2 }, "y+")],
    },
  })

  solver.solve()

  const placements = solver.layout!.chipPlacements
  expect(Math.abs(placements.C2!.x - placements.C1!.x)).toBeCloseTo(1.55)
})

test("decoupling caps without external main-pin data fall back to natural order", () => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: makeDecouplingCapPartition(),
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  const placements = solver.layout!.chipPlacements
  expect(placements.C1!.x).toBeLessThan(placements.C2!.x)
  expect(placements.C2!.x).toBeLessThan(placements.C10!.x)
})
