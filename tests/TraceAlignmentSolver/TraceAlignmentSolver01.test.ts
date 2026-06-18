import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { TraceAlignmentSolver } from "lib/solvers/TraceAlignmentSolver/TraceAlignmentSolver"
import type { InputProblem } from "lib/types/InputProblem"
import si7021Input from "../../pages/repros/repro-si7021/si7021-matchpack-input.json"

/**
 * Bounty #12 / repro #11: the SI7021 layout produced messy traces because
 * strongly-connected pads on different chips ended up at slightly different
 * Y values. The TraceAlignmentSolver post-pack phase should reduce that
 * "off-axis pad delta" without introducing chip overlaps.
 */
test("TraceAlignmentSolver - reduces pad delta on SI7021 repro", () => {
  const problem: InputProblem = si7021Input as unknown as InputProblem
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.traceAlignmentSolver?.solved).toBe(true)

  const align = solver.traceAlignmentSolver!
  // Sanity: there must have been some leaf candidates to align on the
  // SI7021 circuit (R1, R2, SJ1, C2 all qualify with one strong neighbor).
  expect(align.candidateChipCount).toBeGreaterThan(0)

  // Aligned layout should have lower-or-equal max pad delta than the
  // partition packing layout, and at least one nudge should have been
  // applied for this circuit (otherwise the metric is trivially equal).
  expect(align.finalMaxPadDelta).toBeLessThanOrEqual(align.initialMaxPadDelta)
  expect(align.appliedNudgeCount).toBeGreaterThan(0)

  // No new chip overlaps should be introduced.
  const overlaps = solver.checkForOverlaps(solver.getOutputLayout())
  expect(overlaps.length).toBe(0)
})

test("TraceAlignmentSolver - aligns leaf chip directly when run in isolation", () => {
  // Minimal fixture: U has an x+ pin at y=+0.2; R has a y+ pin at top. After
  // partition packing R is to the right of U with R.y == U.y, so R's top pin
  // lands at R.y + 0.5 while U's right pin is at U.y + 0.2. The aligner
  // should nudge R down by 0.3.
  const problem: InputProblem = {
    chipMap: {
      U: {
        chipId: "U",
        pins: ["U.1"],
        size: { x: 1, y: 1 },
        availableRotations: [0],
      },
      R: {
        chipId: "R",
        pins: ["R.1", "R.2"],
        size: { x: 0.4, y: 1 },
        availableRotations: [0],
      },
    },
    chipPinMap: {
      "U.1": { pinId: "U.1", side: "x+", offset: { x: 0.5, y: 0.2 } },
      "R.1": { pinId: "R.1", side: "y+", offset: { x: 0, y: 0.5 } },
      "R.2": { pinId: "R.2", side: "y-", offset: { x: 0, y: -0.5 } },
    },
    netMap: {},
    pinStrongConnMap: {
      "U.1-R.1": true,
    },
    netConnMap: {},
    chipGap: 0.4,
    partitionGap: 1.2,
  }

  // Pretend the partition packing produced this layout.
  const layout = {
    chipPlacements: {
      U: { x: 0, y: 0, ccwRotationDegrees: 0 },
      R: { x: 1.5, y: 0, ccwRotationDegrees: 0 },
    },
    groupPlacements: {},
  }

  const aligner = new TraceAlignmentSolver({
    inputProblem: problem,
    layout,
  })
  aligner.solve()
  expect(aligner.solved).toBe(true)
  expect(aligner.alignedLayout).not.toBeNull()

  const aligned = aligner.alignedLayout!
  // U should be unchanged (it is not a leaf in this graph because it has
  // exactly one strong connection too, but R is preferred by alphabetical
  // ordering... actually both qualify — we just assert the relative
  // alignment, not which one moved).
  const uPinY = aligned.chipPlacements["U"]!.y + 0.2 // U.1 offset y
  const rPinY = aligned.chipPlacements["R"]!.y + 0.5 // R.1 offset y
  expect(Math.abs(uPinY - rPinY)).toBeLessThan(1e-6)
})
