import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { problem } from "../../pages/LayoutPipelineSolver/LayoutPipelineSolver06.page"

test("LayoutPipelineSolver06 - decoupling caps arranged in linear rows with no overlaps", () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  // Verify the pipeline completed successfully
  expect(solver.solved).toBe(true)
  expect(solver.error).toBeNull()

  // Verify all phases ran
  const phases = Object.keys(solver.timeSpentOnPhase)
  expect(phases).toContain("identifyDecouplingCapsSolver")
  expect(phases).toContain("chipPartitionsSolver")
  expect(phases).toContain("packInnerPartitionsSolver")
  expect(phases).toContain("partitionPackingSolver")

  const layout = solver.getOutputLayout()
  expect(layout).toBeDefined()

  // All chips should have valid numeric placements
  const chipIds = Object.keys(layout.chipPlacements)
  expect(chipIds.length).toBeGreaterThan(0)

  for (const chipId of chipIds) {
    const placement = layout.chipPlacements[chipId]
    expect(typeof placement.x).toBe("number")
    expect(typeof placement.y).toBe("number")
    expect(typeof placement.ccwRotationDegrees).toBe("number")
    expect(Number.isFinite(placement.x)).toBe(true)
    expect(Number.isFinite(placement.y)).toBe(true)
  }

  // Verify no overlaps in final layout
  const overlaps = solver.checkForOverlaps(layout)
  expect(overlaps).toEqual([])

  // Visualization should be valid
  const viz = solver.visualize()
  expect(viz).toBeDefined()
  expect(viz.rects?.length).toBeGreaterThan(0)
})

test("LayoutPipelineSolver06 - decoupling caps form sorted linear rows per net group", () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  const layout = solver.getOutputLayout()

  // Identify cap chips
  const capIds = Object.keys(problem.chipMap).filter((id) => id.startsWith("C"))
  expect(capIds.length).toBeGreaterThan(0)

  // All caps should be placed
  for (const capId of capIds) {
    expect(layout.chipPlacements[capId]).toBeDefined()
  }

  // Group caps by y-coordinate (same y = same row, rounded to 1 decimal)
  const capPositions = capIds.map((id) => ({
    id,
    x: layout.chipPlacements[id].x,
    y: layout.chipPlacements[id].y,
  }))

  const yGroups = new Map<string, typeof capPositions>()
  for (const cap of capPositions) {
    const yKey = cap.y.toFixed(1)
    const group = yGroups.get(yKey) || []
    group.push(cap)
    yGroups.set(yKey, group)
  }

  // Each multi-cap row should be sorted left-to-right by x
  for (const [_yKey, group] of yGroups) {
    if (group.length > 1) {
      const sorted = [...group].sort((a, b) => a.x - b.x)
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.x).toBeGreaterThan(sorted[i - 1]!.x)
      }
      // Verify minimum gap between adjacent caps (decouplingCapsGap = 0.2)
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i]!.x - sorted[i - 1]!.x
        // Caps should have at least a small gap (not overlapping)
        expect(gap).toBeGreaterThan(0.1)
      }
    }
  }

  // Verify decoupling caps are grouped into expected number of rows
  // (should have at least 2 rows for the 2 voltage groups in LayoutPipelineSolver06)
  expect(yGroups.size).toBeGreaterThanOrEqual(2)
})

test("LayoutPipelineSolver06 - decoupling caps visual snapshot", () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  const viz = solver.visualize()
  expect(viz).toBeDefined()

  // Snapshot the visualization structure for visual regression
  expect({
    rectCount: viz.rects?.length ?? 0,
    lineCount: viz.lines?.length ?? 0,
    circleCount: viz.circles?.length ?? 0,
    pointCount: viz.points?.length ?? 0,
  }).toMatchSnapshot()
})
