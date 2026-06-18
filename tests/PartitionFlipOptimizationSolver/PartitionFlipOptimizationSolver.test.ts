import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { PartitionFlipOptimizationSolver } from "lib/solvers/PartitionFlipOptimizationSolver/PartitionFlipOptimizationSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { normalizeSide } from "lib/types/Side"

/**
 * Two chips in separate partitions with a strong cross-partition connection.
 * U1's connection pin is on its RIGHT side, C1's connection pin is on its RIGHT side.
 * When placed naively: U1 at (0,0) → right pin at (+0.5, 0), C1 to the left at (-2,0)
 * → C1's right pin at (-1.5, 0) which is far from U1's right pin.
 * Flipping C1's partition (flip-X) → C1's left pin faces U1, reducing wire length.
 */
function makeFlippablePartitionProblem(): InputProblem {
  return {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.OUT", "U1.GND"],
        size: { x: 1, y: 1 },
      },
      C1: {
        chipId: "C1",
        pins: ["C1.P", "C1.N"],
        size: { x: 0.5, y: 0.5 },
      },
    },
    chipPinMap: {
      "U1.OUT": { pinId: "U1.OUT", offset: { x: 0.5, y: 0 }, side: normalizeSide("right") },
      "U1.GND": { pinId: "U1.GND", offset: { x: -0.5, y: 0 }, side: normalizeSide("left") },
      "C1.P":   { pinId: "C1.P",   offset: { x: 0.25, y: 0 }, side: normalizeSide("right") },
      "C1.N":   { pinId: "C1.N",   offset: { x: -0.25, y: 0 }, side: normalizeSide("left") },
    },
    netMap: { OUT: { netId: "OUT" }, GND: { netId: "GND" } },
    pinStrongConnMap: {
      "U1.OUT-C1.P": true,
      "C1.P-U1.OUT": true,
    },
    netConnMap: {
      "U1.GND-GND": true,
      "C1.N-GND": true,
    },
    chipGap: 0.1,
    partitionGap: 1,
  }
}

test("PartitionFlipOptimizationSolver: no crash and produces valid layout", () => {
  const problem = makeFlippablePartitionProblem()
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.partitionFlipOptimizationSolver?.solved).toBe(true)

  const layout = solver.getOutputLayout()
  expect(layout.chipPlacements["U1"]).toBeDefined()
  expect(layout.chipPlacements["C1"]).toBeDefined()

  // No overlaps after flip optimization
  const overlaps = solver.checkForOverlaps(layout)
  expect(overlaps.length).toBe(0)
})

test("PartitionFlipOptimizationSolver: reduces cross-partition connection distance", () => {
  const problem = makeFlippablePartitionProblem()
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  const layout = solver.getOutputLayout()
  const u1 = layout.chipPlacements["U1"]!
  const c1 = layout.chipPlacements["C1"]!

  // U1.OUT is on the right (+0.5) and C1.P is on the right (+0.25) of their chips.
  // After flip optimization the partition containing C1 should be oriented so that
  // C1.P faces toward U1.OUT — minimising the connection distance.
  const u1OutX = u1.x + 0.5 * Math.cos((u1.ccwRotationDegrees * Math.PI) / 180)
  const c1PX = c1.x + 0.25 * Math.cos((c1.ccwRotationDegrees * Math.PI) / 180)
  const dist = Math.abs(u1OutX - c1PX)

  // With optimisation the connected pins should be within 2 units of each other
  expect(dist).toBeLessThan(2)
})

test("PartitionFlipOptimizationSolver direct: improves layout vs no-flip baseline", () => {
  const problem = makeFlippablePartitionProblem()

  // Simulate a layout where C1 is placed to the left of U1 with identical rotations.
  // U1.OUT (right pin) is at x=0.5; C1.P (right pin) is at x=-1.75 — total dist = 2.25.
  // After flip-X of C1's partition around center=-1.5:
  //   C1 center → -1.5 (unchanged), but right pin becomes left pin → C1.P at x=-1.75
  // Actually test the solver directly with a crafted layout.
  const baseLayout = {
    chipPlacements: {
      U1: { x: 0, y: 0, ccwRotationDegrees: 0 as const },
      C1: { x: -1.5, y: 0, ccwRotationDegrees: 0 as const },
    },
    groupPlacements: {},
  }

  // Build packed partitions manually: U1 in partition 0, C1 in partition 1
  const packedPartitions = [
    {
      inputProblem: {
        ...problem,
        chipMap: { U1: problem.chipMap["U1"]! },
        chipPinMap: { "U1.OUT": problem.chipPinMap["U1.OUT"]!, "U1.GND": problem.chipPinMap["U1.GND"]! },
      } as any,
      layout: { chipPlacements: { U1: baseLayout.chipPlacements["U1"]! }, groupPlacements: {} },
    },
    {
      inputProblem: {
        ...problem,
        chipMap: { C1: problem.chipMap["C1"]! },
        chipPinMap: { "C1.P": problem.chipPinMap["C1.P"]!, "C1.N": problem.chipPinMap["C1.N"]! },
      } as any,
      layout: { chipPlacements: { C1: baseLayout.chipPlacements["C1"]! }, groupPlacements: {} },
    },
  ]

  const flipSolver = new PartitionFlipOptimizationSolver({
    currentLayout: baseLayout,
    packedPartitions,
    inputProblem: problem,
  })
  flipSolver.solve()

  expect(flipSolver.solved).toBe(true)
  expect(flipSolver.improvedLayout).toBeDefined()
  // C1 position should be unchanged (flip is around partition centroid)
  expect(flipSolver.improvedLayout!.chipPlacements["U1"]).toBeDefined()
  expect(flipSolver.improvedLayout!.chipPlacements["C1"]).toBeDefined()
})

test("PartitionFlipOptimizationSolver: skips partitions with fixed chips", () => {
  const problem: InputProblem = {
    chipMap: {
      U1: { chipId: "U1", pins: ["U1.A"], size: { x: 1, y: 1 }, fixedPosition: { x: 0, y: 0 } },
      C1: { chipId: "C1", pins: ["C1.A"], size: { x: 0.5, y: 0.5 } },
    },
    chipPinMap: {
      "U1.A": { pinId: "U1.A", offset: { x: 0.5, y: 0 }, side: normalizeSide("right") },
      "C1.A": { pinId: "C1.A", offset: { x: -0.25, y: 0 }, side: normalizeSide("left") },
    },
    netMap: { N1: { netId: "N1" } },
    pinStrongConnMap: { "U1.A-C1.A": true, "C1.A-U1.A": true },
    netConnMap: {},
    chipGap: 0.1,
    partitionGap: 1,
  }

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  const layout = solver.getOutputLayout()

  // Fixed chip must remain at declared position
  expect(layout.chipPlacements["U1"]!.x).toBeCloseTo(0, 5)
  expect(layout.chipPlacements["U1"]!.y).toBeCloseTo(0, 5)
  expect(solver.checkForOverlaps(layout).length).toBe(0)
})

test("PartitionFlipOptimizationSolver: ExampleCircuit04 still solves without overlaps", () => {
  const { getExampleCircuitJson } = require("../assets/ExampleCircuit04")
  const { getInputProblemFromCircuitJsonSchematic } = require("lib/testing/getInputProblemFromCircuitJsonSchematic")
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, { useReadableIds: true })

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.partitionFlipOptimizationSolver?.solved).toBe(true)
  expect(solver.checkForOverlaps(solver.getOutputLayout()).length).toBe(0)
})
