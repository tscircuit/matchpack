import { expect, test } from "bun:test"
import type { GraphicsObject } from "graphics-debug"
import { ChipPartitionsSolver } from "lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import { doBasicInputProblemLayout } from "lib/solvers/LayoutPipelineSolver/doBasicInputProblemLayout"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { PackInnerPartitionsSolver } from "lib/solvers/PackInnerPartitionsSolver/PackInnerPartitionsSolver"
import { PartitionPackingSolver } from "lib/solvers/PartitionPackingSolver/PartitionPackingSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { normalizeSide } from "lib/types/Side"

const getVisibleRectCount = (graphics: GraphicsObject): number =>
  graphics.rects?.length ?? 0

test("LayoutPipelineSolverFixed01: fixed chip + connected free chip in same partition", () => {
  const problem: InputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.A", "U1.B"],
        size: { x: 2, y: 2 },
        fixedPosition: { x: 0, y: 0 },
        availableRotations: [0],
      },
      C1: {
        chipId: "C1",
        pins: ["C1.A", "C1.B"],
        size: { x: 1, y: 0.5 },
      },
    },
    chipPinMap: {
      "U1.A": {
        pinId: "U1.A",
        offset: { x: -1, y: 0 },
        side: normalizeSide("left"),
      },
      "U1.B": {
        pinId: "U1.B",
        offset: { x: 1, y: 0 },
        side: normalizeSide("right"),
      },
      "C1.A": {
        pinId: "C1.A",
        offset: { x: -0.5, y: 0 },
        side: normalizeSide("left"),
      },
      "C1.B": {
        pinId: "C1.B",
        offset: { x: 0.5, y: 0 },
        side: normalizeSide("right"),
      },
    },
    netMap: { N1: { netId: "N1" } },
    // U1.B strongly connected to C1.A
    pinStrongConnMap: {
      "U1.B-C1.A": true,
      "C1.A-U1.B": true,
    },
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const layout = solver.getOutputLayout()
  expect(layout.chipPlacements["U1"]).toBeDefined()
  expect(layout.chipPlacements["C1"]).toBeDefined()

  // Fixed chip must stay at its declared position
  expect(layout.chipPlacements["U1"]!.x).toBeCloseTo(0, 5)
  expect(layout.chipPlacements["U1"]!.y).toBeCloseTo(0, 5)
  expect(layout.chipPlacements["U1"]!.ccwRotationDegrees).toBe(0)

  // No overlaps
  const overlaps = solver.checkForOverlaps(layout)
  expect(overlaps.length).toBe(0)
})

test("LayoutPipelineSolverFixed02: fixed chip in one partition, free chip in separate partition", () => {
  const problem: InputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.A"],
        size: { x: 2, y: 2 },
        fixedPosition: { x: 5, y: 5 },
      },
      R1: {
        chipId: "R1",
        pins: ["R1.A", "R1.B"],
        size: { x: 1, y: 0.5 },
      },
    },
    chipPinMap: {
      "U1.A": {
        pinId: "U1.A",
        offset: { x: 1, y: 0 },
        side: normalizeSide("right"),
      },
      "R1.A": {
        pinId: "R1.A",
        offset: { x: -0.5, y: 0 },
        side: normalizeSide("left"),
      },
      "R1.B": {
        pinId: "R1.B",
        offset: { x: 0.5, y: 0 },
        side: normalizeSide("right"),
      },
    },
    netMap: { VCC: { netId: "VCC" } },
    pinStrongConnMap: {},
    netConnMap: {
      "U1.A-VCC": true,
      "R1.A-VCC": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)

  const layout = solver.getOutputLayout()

  // Fixed chip must be at its declared position
  expect(layout.chipPlacements["U1"]!.x).toBeCloseTo(5, 5)
  expect(layout.chipPlacements["U1"]!.y).toBeCloseTo(5, 5)

  // No overlaps
  const overlaps = solver.checkForOverlaps(layout)
  expect(overlaps.length).toBe(0)
})

test("LayoutPipelineSolverFixed03: all chips fixed", () => {
  const problem: InputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.A"],
        size: { x: 2, y: 2 },
        fixedPosition: { x: -3, y: 0 },
        availableRotations: [0],
      },
      U2: {
        chipId: "U2",
        pins: ["U2.A"],
        size: { x: 1.5, y: 1.5 },
        fixedPosition: { x: 3, y: 1 },
        availableRotations: [90],
      },
    },
    chipPinMap: {
      "U1.A": {
        pinId: "U1.A",
        offset: { x: 1, y: 0 },
        side: normalizeSide("right"),
      },
      "U2.A": {
        pinId: "U2.A",
        offset: { x: -0.75, y: 0 },
        side: normalizeSide("left"),
      },
    },
    netMap: { N1: { netId: "N1" } },
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)

  const layout = solver.getOutputLayout()

  expect(layout.chipPlacements["U1"]!.x).toBeCloseTo(-3, 5)
  expect(layout.chipPlacements["U1"]!.y).toBeCloseTo(0, 5)
  expect(layout.chipPlacements["U1"]!.ccwRotationDegrees).toBe(0)

  expect(layout.chipPlacements["U2"]!.x).toBeCloseTo(3, 5)
  expect(layout.chipPlacements["U2"]!.y).toBeCloseTo(1, 5)
  expect(layout.chipPlacements["U2"]!.ccwRotationDegrees).toBe(90)

  const overlaps = solver.checkForOverlaps(layout)
  expect(overlaps.length).toBe(0)
})

test("LayoutPipelineSolver initial visualization shows fixed chips at fixed position with labels", () => {
  const problem: InputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.A"],
        size: { x: 2, y: 2 },
      },
      C1: {
        chipId: "C1",
        pins: ["C1.A"],
        size: { x: 1, y: 0.5 },
        fixedPosition: { x: 4, y: 2 },
        availableRotations: [0],
      },
    },
    chipPinMap: {
      "U1.A": {
        pinId: "U1.A",
        offset: { x: 1, y: 0 },
        side: normalizeSide("right"),
      },
      "C1.A": {
        pinId: "C1.A",
        offset: { x: 0.5, y: 0 },
        side: normalizeSide("right"),
      },
    },
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new LayoutPipelineSolver(problem)
  const graphics = solver.visualize() as GraphicsObject
  const fixedRect = graphics.rects?.find((rect) => rect.label === "C1 [fixed]")
  const fixedLabel = graphics.texts?.find((text) => text.text === "C1 [fixed]")

  expect(solver.iterations).toBe(0)
  expect(fixedRect?.center.x).toBeCloseTo(4, 5)
  expect(fixedRect?.center.y).toBeCloseTo(2, 5)
  expect(fixedRect?.fill).toBe("rgba(30, 64, 175, 0.35)")
  expect(fixedLabel?.x).toBeCloseTo(4, 5)
  expect(fixedLabel?.y).toBeCloseTo(2, 5)
})

test("solver first frames show input state before stepping", () => {
  const problem: InputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.A", "U1.B"],
        size: { x: 2, y: 2 },
      },
      C1: {
        chipId: "C1",
        pins: ["C1.A", "C1.B"],
        size: { x: 1, y: 0.5 },
      },
    },
    chipPinMap: {
      "U1.A": {
        pinId: "U1.A",
        offset: { x: -1, y: 0 },
        side: normalizeSide("left"),
      },
      "U1.B": {
        pinId: "U1.B",
        offset: { x: 1, y: 0 },
        side: normalizeSide("right"),
      },
      "C1.A": {
        pinId: "C1.A",
        offset: { x: -0.5, y: 0 },
        side: normalizeSide("left"),
      },
      "C1.B": {
        pinId: "C1.B",
        offset: { x: 0.5, y: 0 },
        side: normalizeSide("right"),
      },
    },
    netMap: {},
    pinStrongConnMap: {
      "U1.B-C1.A": true,
      "C1.A-U1.B": true,
    },
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  }

  const chipPartitionsSolver = new ChipPartitionsSolver({
    inputProblem: problem,
  })
  expect(getVisibleRectCount(chipPartitionsSolver.visualize())).toBeGreaterThan(
    0,
  )
  chipPartitionsSolver.solve()

  const packInnerPartitionsSolver = new PackInnerPartitionsSolver({
    partitions: chipPartitionsSolver.partitions,
    pinIdToStronglyConnectedPins: {},
  })
  expect(
    getVisibleRectCount(packInnerPartitionsSolver.visualize()),
  ).toBeGreaterThan(0)

  const basicLayout = doBasicInputProblemLayout(problem)
  const partitionPackingSolver = new PartitionPackingSolver({
    inputProblem: problem,
    packedPartitions: [
      {
        inputProblem: problem,
        layout: basicLayout,
      },
    ],
  })
  expect(
    getVisibleRectCount(partitionPackingSolver.visualize()),
  ).toBeGreaterThan(0)
})
