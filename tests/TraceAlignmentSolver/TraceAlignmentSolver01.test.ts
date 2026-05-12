import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { TraceAlignmentSolver } from "lib/solvers/TraceAlignmentSolver/TraceAlignmentSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import SI7021Input from "../../pages/repros/repro-si7021/si7021-matchpack-input.json"
import { getExampleCircuitJson } from "../assets/ExampleCircuit04"
import type { InputProblem, PinId } from "lib/types/InputProblem"

test("TraceAlignmentSolver01 - reduces zig-zag on SI7021 repro", () => {
  const problem = SI7021Input as InputProblem

  // Run the layout pipeline first
  const pipelineSolver = new LayoutPipelineSolver(problem)
  pipelineSolver.solve()
  const layoutBefore = pipelineSolver.getOutputLayout()

  // Compute zig-zag before alignment
  const alignerBefore = new TraceAlignmentSolver({
    inputProblem: problem,
    layout: layoutBefore,
  })
  alignerBefore.buildStrongConnectionPairs()

  // Compute average zig-zag for all strong connections
  let totalZigZagBefore = 0
  let connectionCount = 0
  for (const pair of alignerBefore.strongConnectionPairs) {
    const p1 = alignerBefore.computeWorldPinPos(pair.pin1)
    const p2 = alignerBefore.computeWorldPinPos(pair.pin2)
    if (!p1 || !p2) continue

    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const isHorizontal =
      (p1.side === "x+" || p1.side === "x-") &&
      (p2.side === "x+" || p2.side === "x-")
    const isVertical =
      (p1.side === "y+" || p1.side === "y-") &&
      (p2.side === "y+" || p2.side === "y-")

    let zigzag: number
    if (isHorizontal) zigzag = Math.abs(dy)
    else if (isVertical) zigzag = Math.abs(dx)
    else zigzag = Math.min(Math.abs(dx), Math.abs(dy))

    totalZigZagBefore += zigzag
    connectionCount++
  }
  const avgZigZagBefore = connectionCount > 0 ? totalZigZagBefore / connectionCount : 0

  // Run trace alignment
  const aligner = new TraceAlignmentSolver({
    inputProblem: problem,
    layout: layoutBefore,
    maxNudge: 0.6,
    minImprovement: 0.05,
    passes: 3,
  })
  aligner.solve()

  // Compute zig-zag after alignment
  let totalZigZagAfter = 0
  const alignerAfter = new TraceAlignmentSolver({
    inputProblem: problem,
    layout: aligner.layout,
  })
  for (const pair of alignerAfter.strongConnectionPairs) {
    const p1 = alignerAfter.computeWorldPinPos(pair.pin1)
    const p2 = alignerAfter.computeWorldPinPos(pair.pin2)
    if (!p1 || !p2) continue

    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const isHorizontal =
      (p1.side === "x+" || p1.side === "x-") &&
      (p2.side === "x+" || p2.side === "x-")
    const isVertical =
      (p1.side === "y+" || p1.side === "y-") &&
      (p2.side === "y+" || p2.side === "y-")

    let zigzag: number
    if (isHorizontal) zigzag = Math.abs(dy)
    else if (isVertical) zigzag = Math.abs(dx)
    else zigzag = Math.min(Math.abs(dx), Math.abs(dy))

    totalZigZagAfter += zigzag
  }
  const avgZigZagAfter = connectionCount > 0 ? totalZigZagAfter / connectionCount : 0

  // The alignment should reduce zig-zag
  console.log(`Average zig-zag: ${avgZigZagBefore.toFixed(3)} → ${avgZigZagAfter.toFixed(3)} (${((1 - avgZigZagAfter / avgZigZagBefore) * 100).toFixed(1)}% reduction)`)
  console.log(`Nudges applied: ${aligner.nudgesApplied.length}`)
  for (const nudge of aligner.nudgesApplied) {
    console.log(`  ${nudge.chipId}: Δ=(${nudge.deltaX.toFixed(3)}, ${nudge.deltaY.toFixed(3)}), improvement=${nudge.improvement.toFixed(3)}`)
  }

  expect(avgZigZagAfter).toBeLessThan(avgZigZagBefore)
})

test("TraceAlignmentSolver02 - preserves overlap-free layout on ExampleCircuit04", () => {
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  const pipelineSolver = new LayoutPipelineSolver(problem)
  pipelineSolver.solve()
  const layout = pipelineSolver.getOutputLayout()

  // No overlaps before
  const overlapsBefore = pipelineSolver.checkForOverlaps(layout)

  // Run trace alignment
  const aligner = new TraceAlignmentSolver({
    inputProblem: problem,
    layout,
  })
  aligner.solve()

  // No overlaps after
  const overlapsAfter = pipelineSolver.checkForOverlaps(aligner.layout)

  expect(overlapsAfter.length).toBeLessThanOrEqual(overlapsBefore.length)
})

test("TraceAlignmentSolver03 - integrated into pipeline on RP2040Circuit", () => {
  import("lib/testing/getInputProblemFromCircuitJsonSchematic").then(({ getInputProblemFromCircuitJsonSchematic: getInput }) => {
    // dynamic
  })
  import("../assets/RP2040Circuit").then(({ getExampleCircuitJson }) => {
    // dynamic
  })
  const { getInputProblemFromCircuitJsonSchematic: getInput } = require("lib/testing/getInputProblemFromCircuitJsonSchematic")
  const { getExampleCircuitJson } = require("../assets/RP2040Circuit")

  const circuitJson = getExampleCircuitJson()
  const problem = getInput(circuitJson, { useReadableIds: true })

  const pipelineSolver = new LayoutPipelineSolver(problem)
  pipelineSolver.solve()
  const layout = pipelineSolver.getOutputLayout()

  const overlapsBefore = pipelineSolver.checkForOverlaps(layout)
  console.log(`RP2040 overlaps before: ${overlapsBefore.length}`)
  for (const o of overlapsBefore) {
    console.log(`  ${o.chip1} overlaps ${o.chip2} (area: ${o.overlapArea.toFixed(4)})`)
  }

  // Run trace alignment
  const aligner = new TraceAlignmentSolver({
    inputProblem: problem,
    layout,
    maxNudge: 0.6,
    minImprovement: 0.02,
    passes: 3,
  })
  aligner.solve()

  const overlapsAfter = pipelineSolver.checkForOverlaps(aligner.layout)
  console.log(`RP2040 overlaps after: ${overlapsAfter.length}`)
  console.log(`Zig-zag: ${aligner.totalZigZagBefore.toFixed(3)} → ${aligner.totalZigZagAfter.toFixed(3)}`)

  // Should not introduce new overlaps
  expect(overlapsAfter.length).toBeLessThanOrEqual(overlapsBefore.length)
})
