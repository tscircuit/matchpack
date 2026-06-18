import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import SI7021Input from "../../pages/repros/repro-si7021/si7021-matchpack-input.json"
import type { InputProblem, PinId } from "lib/types/InputProblem"

test("TraceAlignmentSolver - integrated into pipeline reduces zig-zag on SI7021", () => {
  const problem = SI7021Input as InputProblem

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  // Verify the pipeline includes trace alignment
  expect(solver.traceAlignmentSolver).toBeDefined()
  expect(solver.traceAlignmentSolver!.solved).toBe(true)

  // Verify zig-zag reduction
  expect(solver.traceAlignmentSolver!.totalZigZagAfter).toBeLessThan(
    solver.traceAlignmentSolver!.totalZigZagBefore,
  )

  // Verify no new overlaps
  const layout = solver.getOutputLayout()
  const overlaps = solver.checkForOverlaps(layout)
  expect(overlaps.length).toBe(0)

  // Verify all chips still have placements
  for (const chipId of Object.keys(problem.chipMap)) {
    expect(layout.chipPlacements[chipId]).toBeDefined()
  }

  console.log(
    `Pipeline zig-zag: ${solver.traceAlignmentSolver!.totalZigZagBefore.toFixed(3)} → ${solver.traceAlignmentSolver!.totalZigZagAfter.toFixed(3)}`,
  )
  console.log(
    `Pipeline nudges: ${solver.traceAlignmentSolver!.nudgesApplied.length}`,
  )
})
