import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { canLayoutDecouplingCapRow } from "lib/solvers/PackInnerPartitionsSolver/DecouplingCapRowSolver"
import { getDecouplingCapRowLayout } from "lib/solvers/PackInnerPartitionsSolver/getDecouplingCapRowLayout"
import { PlaceNetOnlyDecouplingRowsSolver } from "lib/solvers/PlaceNetOnlyDecouplingRowsSolver/PlaceNetOnlyDecouplingRowsSolver"
import type {
  ChipPin,
  InputProblem,
  PartitionInputProblem,
} from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import input from "../assets/repro-rp2040-decoupling-capacitors-wide.input.json"

const caps = ["C12", "C14", "C8", "C13", "C15", "C19"]

test("keeps the RP2040 rail row between two compatible fixed capacitors", () => {
  const problem = structuredClone(input) as InputProblem
  problem.chipMap.C12!.fixedPosition = { x: -20, y: 10 }
  problem.chipMap.C19!.fixedPosition = { x: -27.825, y: 10 }
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  const layout = solver.getOutputLayout()
  for (const [index, chipId] of caps.entries()) {
    expect(layout.chipPlacements[chipId]!.y).toBeCloseTo(10)
    expect(layout.chipPlacements[chipId]!.x).toBeCloseTo(-20 - index * 1.565)
  }
  expect(layout.chipPlacements.C12).toMatchObject({ x: -20, y: 10 })
  expect(layout.chipPlacements.C19).toMatchObject({ x: -27.825, y: 10 })
  expect(solver.checkForOverlaps(layout)).toEqual([])
})

type Rotation = 0 | 90 | 180 | 270
const expectedBase = {
  A: { x: 1.6, y: -0.3 },
  B: { x: -0.1, y: -0.4 },
  C: { x: -1.7, y: -0.3 },
}
const movedPoint = (point: { x: number; y: number }, rotation: Rotation) => {
  const rotated =
    rotation === 0
      ? point
      : rotation === 90
        ? { x: -point.y, y: point.x }
        : rotation === 180
          ? { x: -point.x, y: -point.y }
          : { x: point.y, y: -point.x }
  return { x: rotated.x + 10, y: rotated.y + 20 }
}

const makePartition = (rotation: Rotation = 0): PartitionInputProblem => {
  const chipPinMap: Record<string, ChipPin> = {}
  const netConnMap: InputProblem["netConnMap"] = {}
  const chipMap: InputProblem["chipMap"] = {}
  for (const id of ["A", "B", "C"] as const) {
    const offset = id === "B" ? 0.4 : 0.3
    chipMap[id] = {
      chipId: id,
      pins: [`${id}.p`, `${id}.g`],
      size: { x: id === "A" ? 1 : id === "B" ? 1.6 : 0.8, y: 0.8 },
      isCapacitor: true,
      availableRotations: [rotation],
    }
    for (const [pin, sign] of [
      ["p", 1],
      ["g", -1],
    ] as const) {
      const pinId = `${id}.${pin}`
      chipPinMap[pinId] = {
        pinId,
        offset: { x: id === "B" ? 0.15 : 0, y: sign * offset },
        side: sign > 0 ? "y+" : "y-",
      }
      netConnMap[`${pinId}-${pin === "p" ? "power" : "ground"}`] = true
    }
  }
  return {
    chipMap,
    chipPinMap,
    netConnMap,
    pinStrongConnMap: {},
    netMap: {
      power: { netId: "power", isPositiveVoltageSource: true },
      ground: { netId: "ground", isGround: true },
    },
    chipGap: 0.6,
    partitionGap: 1.2,
    decouplingCapsGap: 0.4,
    partitionType: "decoupling_caps",
    decouplingMainChipId: "U1",
    decouplingMainChipSide:
      rotation === 0
        ? "x-"
        : rotation === 90
          ? "y-"
          : rotation === 180
            ? "x+"
            : "y+",
  }
}

for (const rotation of [0, 90, 180, 270] as const) {
  for (const anchored of [
    ["A", "C"],
    ["A", "B", "C"],
  ] as const) {
    test(`aligns rail pins with ${anchored.length} fixed caps at ${rotation} degrees`, () => {
      const partition = makePartition(rotation)
      for (const id of anchored)
        partition.chipMap[id]!.fixedPosition = movedPoint(
          expectedBase[id],
          rotation,
        )
      const before = structuredClone(partition)
      expect(canLayoutDecouplingCapRow(partition)).toBe(true)
      const layout = getDecouplingCapRowLayout(partition)!
      for (const id of ["A", "B", "C"] as const) {
        const expected = movedPoint(expectedBase[id], rotation)
        const actual = layout.chipPlacements[id]!
        expect(actual.x).toBeCloseTo(expected.x, 8)
        expect(actual.y).toBeCloseTo(expected.y, 8)
        expect(actual.ccwRotationDegrees).toBe(rotation)
        const pin = rotatePinOffset(
          partition.chipPinMap[`${id}.p`]!.offset,
          rotation,
        )
        const axis = rotation % 180 === 0 ? "y" : "x"
        expect(actual[axis] + pin[axis]).toBeCloseTo(axis === "y" ? 20 : 10, 8)
      }
      for (const id of anchored)
        expect(layout.chipPlacements[id]).toMatchObject(
          partition.chipMap[id]!.fixedPosition!,
        )
      expect(partition).toEqual(before)
    })
  }
}

test("an interior fixed capacitor anchors both neighbors", () => {
  const partition = makePartition()
  partition.chipMap.B!.fixedPosition = movedPoint(expectedBase.B, 0)
  const layout = getDecouplingCapRowLayout(partition)!
  for (const id of ["A", "B", "C"] as const) {
    const expected = movedPoint(expectedBase[id], 0)
    expect(layout.chipPlacements[id]!.x).toBeCloseTo(expected.x)
    expect(layout.chipPlacements[id]!.y).toBeCloseTo(expected.y)
  }
})

test("incompatible anchors reject the row strategy without changing input", () => {
  const partition = makePartition()
  partition.chipMap.A!.fixedPosition = { x: 10, y: 20 }
  partition.chipMap.C!.fixedPosition = { x: 10, y: 25 }
  const before = structuredClone(partition)
  expect(canLayoutDecouplingCapRow(partition)).toBe(false)
  expect(getDecouplingCapRowLayout(partition)).toBeNull()
  expect(partition).toEqual(before)
})

test("net-only row placement preserves a collision-free anchored row", () => {
  const partition = makePartition()
  partition.chipMap.A!.fixedPosition = movedPoint(expectedBase.A, 0)
  partition.chipMap.C!.fixedPosition = movedPoint(expectedBase.C, 0)
  const main: InputProblem = {
    ...partition,
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.p", "U1.g", "U1.s"],
        size: { x: 2, y: 2 },
      },
    },
    chipPinMap: {
      "U1.p": { pinId: "U1.p", side: "x-", offset: { x: -1, y: 0.5 } },
      "U1.g": { pinId: "U1.g", side: "x-", offset: { x: -1, y: -0.5 } },
      "U1.s": { pinId: "U1.s", side: "x+", offset: { x: 1, y: 0 } },
    },
    netConnMap: { "U1.p-power": true, "U1.g-ground": true },
  }
  const inputProblem: InputProblem = {
    ...partition,
    chipMap: { ...main.chipMap, ...partition.chipMap },
    chipPinMap: { ...main.chipPinMap, ...partition.chipPinMap },
    netConnMap: { ...main.netConnMap, ...partition.netConnMap },
  }
  const inputLayout: OutputLayout = {
    chipPlacements: { U1: { x: 0, y: 0, ccwRotationDegrees: 0 } },
    groupPlacements: {},
  }
  for (const id of ["A", "B", "C"] as const)
    inputLayout.chipPlacements[id] = {
      ...movedPoint(expectedBase[id], 0),
      ccwRotationDegrees: 0,
    }
  const before = structuredClone(inputLayout)
  const solver = new PlaceNetOnlyDecouplingRowsSolver({
    inputProblem,
    inputLayout,
    packedPartitions: [
      {
        inputProblem: main,
        layout: {
          chipPlacements: { U1: inputLayout.chipPlacements.U1! },
          groupPlacements: {},
        },
      },
      {
        inputProblem: partition,
        layout: {
          chipPlacements: Object.fromEntries(
            ["A", "B", "C"].map((id) => [id, inputLayout.chipPlacements[id]!]),
          ),
          groupPlacements: {},
        },
      },
    ],
  })
  solver.solve()
  expect(solver.outputLayout).toEqual(before)
  expect(inputLayout).toEqual(before)
})

test("the full pipeline keeps incompatible fixed points when using the packing fallback", () => {
  const problem = structuredClone(input) as InputProblem
  problem.chipMap.C12!.fixedPosition = { x: -20, y: 10 }
  problem.chipMap.C19!.fixedPosition = { x: -20, y: 2 }
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()
  expect(solver.solved).toBe(true)
  const layout = solver.getOutputLayout()
  expect(layout.chipPlacements.C12).toMatchObject(
    problem.chipMap.C12!.fixedPosition!,
  )
  expect(layout.chipPlacements.C19).toMatchObject(
    problem.chipMap.C19!.fixedPosition!,
  )
})
