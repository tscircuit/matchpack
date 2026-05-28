import { expect, test } from "bun:test"
import { OverlapResolutionSolver } from "lib/solvers/OverlapResolutionSolver/OverlapResolutionSolver"
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import { getExampleCircuitJson } from "../assets/RP2040Circuit"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"

const makeProblem = (): InputProblem => ({
  chipMap: {
    A: {
      chipId: "A",
      pins: ["A.1"],
      size: { x: 1, y: 1 },
      availableRotations: [0],
    },
    B: {
      chipId: "B",
      pins: ["B.1"],
      size: { x: 1, y: 1 },
      availableRotations: [0],
    },
  },
  chipPinMap: {
    "A.1": { pinId: "A.1", side: "x+", offset: { x: 0.5, y: 0 } },
    "B.1": { pinId: "B.1", side: "x-", offset: { x: -0.5, y: 0 } },
  },
  groupMap: {},
  groupPinMap: {},
  netMap: {},
  pinStrongConnMap: {},
  netConnMap: {},
  chipGap: 0.2,
  partitionGap: 0.4,
})

test("OverlapResolutionSolver separates two overlapping unit-square chips", () => {
  const problem = makeProblem()
  const layout: OutputLayout = {
    chipPlacements: {
      A: { x: 0, y: 0, ccwRotationDegrees: 0 },
      B: { x: 0.3, y: 0, ccwRotationDegrees: 0 }, // 0.7 of horizontal overlap
    },
    groupPlacements: {},
  }
  const solver = new OverlapResolutionSolver({
    layout,
    inputProblem: problem,
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.remainingOverlapCount).toBe(0)

  // A and B should now be at least chipGap + size apart along x
  const out = solver.finalLayout
  const dx = Math.abs(out.chipPlacements.B!.x - out.chipPlacements.A!.x)
  // Each unit-square chip has half-width 0.5; required separation = 1.0 + chipGap = 1.2
  expect(dx).toBeGreaterThanOrEqual(1.2 - 1e-3)

  // y should stay at 0 because penetration on Y axis was larger than X
  expect(out.chipPlacements.A!.y).toBeCloseTo(0, 5)
  expect(out.chipPlacements.B!.y).toBeCloseTo(0, 5)
})

test("OverlapResolutionSolver is a no-op when layout already has no overlaps", () => {
  const problem = makeProblem()
  const layout: OutputLayout = {
    chipPlacements: {
      A: { x: 0, y: 0, ccwRotationDegrees: 0 },
      B: { x: 5, y: 0, ccwRotationDegrees: 0 },
    },
    groupPlacements: {},
  }
  const solver = new OverlapResolutionSolver({
    layout,
    inputProblem: problem,
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.remainingOverlapCount).toBe(0)
  // Positions unchanged
  expect(solver.finalLayout.chipPlacements.A!.x).toBe(0)
  expect(solver.finalLayout.chipPlacements.B!.x).toBe(5)
})

test("OverlapResolutionSolver does not mutate the input layout", () => {
  const problem = makeProblem()
  const layout: OutputLayout = {
    chipPlacements: {
      A: { x: 0, y: 0, ccwRotationDegrees: 0 },
      B: { x: 0.3, y: 0, ccwRotationDegrees: 0 },
    },
    groupPlacements: {},
  }
  const originalAPlacement = { ...layout.chipPlacements.A! }
  const originalBPlacement = { ...layout.chipPlacements.B! }

  const solver = new OverlapResolutionSolver({
    layout,
    inputProblem: problem,
  })
  solver.solve()

  expect(layout.chipPlacements.A).toEqual(originalAPlacement)
  expect(layout.chipPlacements.B).toEqual(originalBPlacement)
})

test("OverlapResolutionSolver smaller chip moves more than larger anchor chip", () => {
  // A is 10x10 (anchor), B is 1x1 (passive). They overlap; B should move more.
  const problem: InputProblem = {
    chipMap: {
      A: {
        chipId: "A",
        pins: ["A.1"],
        size: { x: 10, y: 10 },
        availableRotations: [0],
      },
      B: {
        chipId: "B",
        pins: ["B.1"],
        size: { x: 1, y: 1 },
        availableRotations: [0],
      },
    },
    chipPinMap: {
      "A.1": { pinId: "A.1", side: "x+", offset: { x: 5, y: 0 } },
      "B.1": { pinId: "B.1", side: "x-", offset: { x: -0.5, y: 0 } },
    },
    groupMap: {},
    groupPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 0.4,
  }
  const layout: OutputLayout = {
    chipPlacements: {
      A: { x: 0, y: 0, ccwRotationDegrees: 0 },
      B: { x: 4, y: 0, ccwRotationDegrees: 0 }, // overlapping into A's right half
    },
    groupPlacements: {},
  }
  const solver = new OverlapResolutionSolver({
    layout,
    inputProblem: problem,
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.remainingOverlapCount).toBe(0)

  const out = solver.finalLayout
  const movedA = Math.abs(out.chipPlacements.A!.x - 0)
  const movedB = Math.abs(out.chipPlacements.B!.x - 4)
  expect(movedB).toBeGreaterThan(movedA)
})

test("LayoutPipelineSolver resolves overlaps in RP2040 circuit", () => {
  // Regression check: the RP2040 circuit used to leave 4 chip overlaps in
  // its final layout. With OverlapResolutionSolver wired in as the final
  // pipeline phase, getOutputLayout() must produce a clean layout.
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.overlapResolutionSolver?.solved).toBe(true)
  expect(solver.overlapResolutionSolver?.remainingOverlapCount).toBe(0)

  const layout = solver.getOutputLayout()
  expect(solver.checkForOverlaps(layout).length).toBe(0)
})
