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

const summarizeVisual = (solver: SingleInnerPartitionPackingSolver) => {
  const graphics = solver.visualize()
  const format = (value: number) =>
    Math.abs(value) < 0.005 ? "0.00" : value.toFixed(2)
  const compareLabels = (a: unknown, b: unknown) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })

  return {
    rects: (graphics.rects ?? [])
      .map((rect) => ({
        label: rect.label,
        center: `${format(rect.center.x)},${format(rect.center.y)}`,
        size: `${format(rect.width)}x${format(rect.height)}`,
      }))
      .sort((a, b) => compareLabels(a.label, b.label)),
    points: (graphics.points ?? [])
      .map((point) => ({
        label: point.label,
        at: `${format(point.x)},${format(point.y)}`,
      }))
      .sort((a, b) => compareLabels(a.label, b.label)),
  }
}

const makeCapOnlyPartition = (): PartitionInputProblem => ({
  chipMap: {
    C10: {
      chipId: "C10",
      pins: ["C10.VCC", "C10.GND"],
      size: { x: 0.2, y: 0.2 },
      availableRotations: [0],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.VCC", "C2.GND"],
      size: { x: 0.2, y: 0.2 },
      availableRotations: [0],
    },
    C1: {
      chipId: "C1",
      pins: ["C1.VCC", "C1.GND"],
      size: { x: 0.2, y: 0.2 },
      availableRotations: [0],
    },
  },
  chipPinMap: {
    "C10.VCC": { pinId: "C10.VCC", offset: { x: -0.6, y: 0 }, side: "x-" },
    "C10.GND": { pinId: "C10.GND", offset: { x: 0.6, y: 0 }, side: "x+" },
    "C2.VCC": { pinId: "C2.VCC", offset: { x: -0.6, y: 0 }, side: "x-" },
    "C2.GND": { pinId: "C2.GND", offset: { x: 0.6, y: 0 }, side: "x+" },
    "C1.VCC": { pinId: "C1.VCC", offset: { x: -0.6, y: 0 }, side: "x-" },
    "C1.GND": { pinId: "C1.GND", offset: { x: 0.6, y: 0 }, side: "x+" },
  },
  netMap: {
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
    GND: { netId: "GND", isGround: true },
  },
  pinStrongConnMap: {},
  netConnMap: {
    "C10.VCC-VCC": true,
    "C10.GND-GND": true,
    "C2.VCC-VCC": true,
    "C2.GND-GND": true,
    "C1.VCC-VCC": true,
    "C1.GND-GND": true,
  },
  chipGap: 0.5,
  decouplingCapsGap: 0.25,
  partitionGap: 1,
  isPartition: true,
  partitionType: "decoupling_caps",
})

test("decoupling cap partitions use a one-step centered visual row from the pin envelope", () => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: makeCapOnlyPartition(),
    pinIdToStronglyConnectedPins: {},
  })

  solver.step()

  expect(solver.solved).toBe(true)
  expect(solver.activeSubSolver).toBeNull()

  const placements = solver.layout!.chipPlacements
  expect(Object.keys(placements)).toEqual(["C1", "C2", "C10"])
  expect(placements.C1!.x).toBeCloseTo(-1.55)
  expect(placements.C2!.x).toBeCloseTo(0)
  expect(placements.C10!.x).toBeCloseTo(1.55)
  expect(placements.C1!.y).toBeCloseTo(0)
  expect(placements.C2!.y).toBeCloseTo(0)
  expect(placements.C10!.y).toBeCloseTo(0)

  expect(summarizeVisual(solver)).toMatchInlineSnapshot(`
    {
      "points": [
        {
          "at": "-0.95,0.00",
          "label": "C1.GND (GND)",
        },
        {
          "at": "-2.15,0.00",
          "label": "C1.VCC (VCC)",
        },
        {
          "at": "0.60,0.00",
          "label": "C2.GND (GND)",
        },
        {
          "at": "-0.60,0.00",
          "label": "C2.VCC (VCC)",
        },
        {
          "at": "2.15,0.00",
          "label": "C10.GND (GND)",
        },
        {
          "at": "0.95,0.00",
          "label": "C10.VCC (VCC)",
        },
      ],
      "rects": [
        {
          "center": "-1.55,0.00",
          "label": "C1",
          "size": "0.20x0.20",
        },
        {
          "center": "0.00,0.00",
          "label": "C2",
          "size": "0.20x0.20",
        },
        {
          "center": "1.55,0.00",
          "label": "C10",
          "size": "0.20x0.20",
        },
      ],
    }
  `)
})

test("decoupling cap layout follows positive-voltage main-pin order on x-side pins", () => {
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: makeCapOnlyPartition(),
    pinIdToStronglyConnectedPins: {
      "C10.VCC": [makeMainPin("U1.VCC10", { x: 2, y: 2 }, "x+")],
      "C2.VCC": [makeMainPin("U1.VCC2", { x: 2, y: 0 }, "x+")],
      "C1.VCC": [makeMainPin("U1.VCC1", { x: 2, y: -2 }, "x+")],
      "C1.GND": [makeMainPin("U1.GND1", { x: 2, y: 3 }, "x+")],
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
