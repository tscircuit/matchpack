import { expect, test } from "bun:test"
import { AlignPowerGroundRowsSolver } from "lib/solvers/AlignPowerGroundRowsSolver/AlignPowerGroundRowsSolver"
import type {
  Chip,
  ChipPin,
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

const createTwoPinChip = (
  chipId: string,
  properties: Partial<Chip> = {},
): Chip => ({
  chipId,
  pins: [`${chipId}.1`, `${chipId}.2`],
  size: { x: 1, y: 1 },
  ...properties,
})

const createPins = (chipIds: string[]): Record<string, ChipPin> =>
  Object.fromEntries(
    chipIds.flatMap((chipId) => [
      [
        `${chipId}.1`,
        {
          pinId: `${chipId}.1`,
          offset: { x: -0.5, y: 0 },
          side: normalizeSide("left"),
        },
      ],
      [
        `${chipId}.2`,
        {
          pinId: `${chipId}.2`,
          offset: { x: 0.5, y: 0 },
          side: normalizeSide("right"),
        },
      ],
    ]),
  )

const createSingleChipPartitions = (
  problem: InputProblem,
): PartitionInputProblem[] =>
  Object.keys(problem.chipMap).map((chipId) => ({
    ...problem,
    isPartition: true,
    chipMap: { [chipId]: problem.chipMap[chipId]! },
  }))

const getBodyClearance = (
  first: OutputLayout["chipPlacements"][string],
  second: OutputLayout["chipPlacements"][string],
): number =>
  Math.max(Math.abs(first.x - second.x) - 1, Math.abs(first.y - second.y) - 1)

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

test("does not reduce clearance between separate alignment groups", () => {
  const chipIds = ["A1", "A2", "B1", "B2"]
  const problem: InputProblem = {
    chipMap: Object.fromEntries(
      chipIds.map((chipId) => [chipId, createTwoPinChip(chipId)]),
    ),
    chipPinMap: createPins(chipIds),
    netMap: {
      GND: { netId: "GND", isGround: true },
      SIGNAL_A: { netId: "SIGNAL_A" },
      SIGNAL_B: { netId: "SIGNAL_B" },
    },
    pinStrongConnMap: {},
    netConnMap: Object.fromEntries(
      chipIds.flatMap((chipId) => [
        [`${chipId}.1-GND`, true],
        [
          `${chipId}.2-${chipId.startsWith("A") ? "SIGNAL_A" : "SIGNAL_B"}`,
          true,
        ],
      ]),
    ),
    chipGap: 0.5,
    partitionGap: 2,
  }
  const layout: OutputLayout = {
    chipPlacements: {
      A1: { x: -5, y: -10, ccwRotationDegrees: 0 },
      A2: { x: 5, y: 10, ccwRotationDegrees: 0 },
      B1: { x: -5, y: -13, ccwRotationDegrees: 0 },
      B2: { x: 5, y: 18, ccwRotationDegrees: 0 },
    },
    groupPlacements: {},
  }
  const solver = new AlignPowerGroundRowsSolver({
    inputProblem: problem,
    inputLayout: layout,
    partitions: createSingleChipPartitions(problem),
  })

  for (const firstChipId of ["A1", "A2"]) {
    for (const secondChipId of ["B1", "B2"]) {
      expect(
        getBodyClearance(
          layout.chipPlacements[firstChipId]!,
          layout.chipPlacements[secondChipId]!,
        ),
      ).toBeGreaterThanOrEqual(problem.partitionGap)
    }
  }

  solver.solve()

  const placements = solver.outputLayout!.chipPlacements
  for (const firstChipId of ["A1", "A2"]) {
    for (const secondChipId of ["B1", "B2"]) {
      expect(
        getBodyClearance(placements[firstChipId]!, placements[secondChipId]!),
      ).toBeGreaterThanOrEqual(problem.partitionGap)
    }
  }
})

test("uses partition membership when spacing aligned capacitors", () => {
  const chipIds = ["C1", "C2"]
  const problem: InputProblem = {
    chipMap: Object.fromEntries(
      chipIds.map((chipId) => [
        chipId,
        createTwoPinChip(chipId, { isCapacitor: true }),
      ]),
    ),
    chipPinMap: createPins(chipIds),
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: Object.fromEntries(
      chipIds.flatMap((chipId) => [
        [`${chipId}.1-VCC`, true],
        [`${chipId}.2-GND`, true],
      ]),
    ),
    chipGap: 0.5,
    partitionGap: 2,
    decouplingCapsGap: 0.4,
  }
  const layout: OutputLayout = {
    chipPlacements: {
      C1: { x: -3, y: 0, ccwRotationDegrees: 0 },
      C2: { x: 3, y: 0, ccwRotationDegrees: 0 },
    },
    groupPlacements: {},
  }
  const solver = new AlignPowerGroundRowsSolver({
    inputProblem: problem,
    inputLayout: layout,
    partitions: createSingleChipPartitions(problem),
  })

  solver.solve()

  const placements = solver.outputLayout!.chipPlacements
  expect(getBodyClearance(placements.C1!, placements.C2!)).toBeCloseTo(
    problem.partitionGap,
  )

  const sameDecouplingPartition = new AlignPowerGroundRowsSolver({
    inputProblem: problem,
    inputLayout: layout,
    partitions: [
      {
        ...problem,
        isPartition: true,
        partitionType: "decoupling_caps",
      },
    ],
  })
  sameDecouplingPartition.solve()

  const compactPlacements = sameDecouplingPartition.outputLayout!.chipPlacements
  expect(
    getBodyClearance(compactPlacements.C1!, compactPlacements.C2!),
  ).toBeCloseTo(problem.decouplingCapsGap!)
})
