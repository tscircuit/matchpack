import { expect, test } from "bun:test"
import { AlignPowerGroundRowsSolver } from "lib/solvers/AlignPowerGroundRowsSolver/AlignPowerGroundRowsSolver"
import type {
  InputProblem,
  PartitionInputProblem,
} from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import { normalizeSide } from "lib/types/Side"

const inputProblem: InputProblem = {
  chipMap: {
    railA: {
      chipId: "railA",
      pins: ["railA.1", "railA.2"],
      size: { x: 1, y: 1 },
    },
    railB: {
      chipId: "railB",
      pins: ["railB.1", "railB.2"],
      size: { x: 1, y: 1 },
    },
    neighbor: {
      chipId: "neighbor",
      pins: [],
      size: { x: 1, y: 1 },
    },
  },
  chipPinMap: {
    "railA.1": {
      pinId: "railA.1",
      offset: { x: -0.5, y: 0 },
      side: normalizeSide("left"),
    },
    "railA.2": {
      pinId: "railA.2",
      offset: { x: 0.5, y: 0 },
      side: normalizeSide("right"),
    },
    "railB.1": {
      pinId: "railB.1",
      offset: { x: -0.5, y: 0 },
      side: normalizeSide("left"),
    },
    "railB.2": {
      pinId: "railB.2",
      offset: { x: 0.5, y: 0 },
      side: normalizeSide("right"),
    },
  },
  netMap: {
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
    GND: { netId: "GND", isGround: true },
  },
  pinStrongConnMap: {},
  netConnMap: {
    "railA.1-VCC": true,
    "railA.2-GND": true,
    "railB.1-VCC": true,
    "railB.2-GND": true,
  },
  chipGap: 0.5,
  partitionGap: 1,
}

const inputLayout: OutputLayout = {
  chipPlacements: {
    railA: { x: -2, y: 0, ccwRotationDegrees: 0 },
    railB: { x: 2, y: 4, ccwRotationDegrees: 0 },
    neighbor: { x: 2, y: 2, ccwRotationDegrees: 0 },
  },
  groupPlacements: {},
}

const partitions: PartitionInputProblem[] = Object.keys(
  inputProblem.chipMap,
).map((chipId) => ({
  ...inputProblem,
  isPartition: true,
  chipMap: { [chipId]: inputProblem.chipMap[chipId]! },
}))

test("row alignment does not create cross-partition clearance violations", () => {
  const solver = new AlignPowerGroundRowsSolver({
    inputProblem,
    inputLayout,
    partitions,
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  const outputLayout = solver.outputLayout!
  const railA = outputLayout.chipPlacements.railA!
  const railB = outputLayout.chipPlacements.railB!
  const neighbor = outputLayout.chipPlacements.neighbor!

  expect(railA.y).toBeCloseTo(railB.y)
  expect(Math.abs(railA.x - railB.x) - 1).toBeCloseTo(inputProblem.partitionGap)
  expect(Math.abs(railB.x - neighbor.x) - 1).toBeGreaterThanOrEqual(
    inputProblem.partitionGap,
  )
})
