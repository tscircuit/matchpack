import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { problem } from "../../pages/LayoutPipelineSolver/LayoutPipelineSolver06.page"

test("Decoupling capacitors are arranged in a linear horizontal row", () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  // Get the identified decoupling cap groups
  const decapGroups =
    solver.identifyDecouplingCapsSolver?.outputDecouplingCapGroups
  expect(decapGroups).toBeDefined()
  expect(decapGroups!.length).toBeGreaterThan(0)

  const layout = solver.getOutputLayout()

  // For each decoupling cap group, verify linear arrangement
  for (const group of decapGroups!) {
    const capIds = group.decouplingCapChipIds

    if (capIds.length < 2) continue // Need at least 2 caps to verify alignment

    // Get placements for all caps in this group
    const placements = capIds.map((id) => ({
      id,
      placement: layout.chipPlacements[id],
    }))

    // Verify all caps have placements
    for (const { id, placement } of placements) {
      expect(placement).toBeDefined()
      expect(typeof placement!.x).toBe("number")
      expect(typeof placement!.y).toBe("number")
    }

    // Sort by X position to check ordering
    placements.sort((a, b) => a.placement!.x - b.placement!.x)

    // Verify all caps are on the same horizontal line (same Y coordinate within tolerance)
    // Note: The partition packing may shift the entire group, but relative Y should be same
    const yValues = placements.map((p) => p.placement!.y)
    const minY = Math.min(...yValues)
    const maxY = Math.max(...yValues)
    const ySpread = maxY - minY

    // All caps should have the same Y coordinate (within floating point tolerance)
    expect(ySpread).toBeLessThan(0.001)

    // Verify caps don't overlap (each X position is greater than previous + width + gap)
    for (let i = 1; i < placements.length; i++) {
      const prev = placements[i - 1]!
      const curr = placements[i]!
      const prevChip = problem.chipMap[prev.id]!
      const gap = problem.decouplingCapsGap ?? problem.chipGap

      // Current cap's left edge should be at or after previous cap's right edge + gap
      const prevRightEdge = prev.placement!.x + prevChip.size.x / 2
      const currLeftEdge =
        curr.placement!.x - problem.chipMap[curr.id]!.size.x / 2
      const actualGap = currLeftEdge - prevRightEdge

      // Gap should be approximately equal to decouplingCapsGap (within tolerance)
      expect(actualGap).toBeGreaterThanOrEqual(gap - 0.001)
      expect(actualGap).toBeLessThanOrEqual(gap + 0.001)
    }
  }
})

test("Decoupling cap groups have no internal overlaps", () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)

  const decapGroups =
    solver.identifyDecouplingCapsSolver?.outputDecouplingCapGroups
  expect(decapGroups).toBeDefined()

  const layout = solver.getOutputLayout()

  // Check for overlaps within each decoupling cap group
  for (const group of decapGroups!) {
    const capIds = group.decouplingCapChipIds

    for (let i = 0; i < capIds.length; i++) {
      for (let j = i + 1; j < capIds.length; j++) {
        const cap1 = capIds[i]!
        const cap2 = capIds[j]!

        const p1 = layout.chipPlacements[cap1]!
        const p2 = layout.chipPlacements[cap2]!
        const chip1 = problem.chipMap[cap1]!
        const chip2 = problem.chipMap[cap2]!

        // Calculate bounding boxes
        const box1 = {
          left: p1.x - chip1.size.x / 2,
          right: p1.x + chip1.size.x / 2,
          top: p1.y + chip1.size.y / 2,
          bottom: p1.y - chip1.size.y / 2,
        }
        const box2 = {
          left: p2.x - chip2.size.x / 2,
          right: p2.x + chip2.size.x / 2,
          top: p2.y + chip2.size.y / 2,
          bottom: p2.y - chip2.size.y / 2,
        }

        // Check for overlap
        const overlapsX = box1.left < box2.right && box1.right > box2.left
        const overlapsY = box1.bottom < box2.top && box1.top > box2.bottom
        const overlaps = overlapsX && overlapsY

        expect(overlaps).toBe(false)
      }
    }
  }
})

test("Linear layout respects decouplingCapsGap setting", () => {
  // Create a modified problem with a specific gap
  const testGap = 0.5
  const testProblem = {
    ...problem,
    decouplingCapsGap: testGap,
  }

  const solver = new LayoutPipelineSolver(testProblem)
  solver.solve()

  expect(solver.solved).toBe(true)

  const decapGroups =
    solver.identifyDecouplingCapsSolver?.outputDecouplingCapGroups
  const layout = solver.getOutputLayout()

  for (const group of decapGroups!) {
    const capIds = group.decouplingCapChipIds
    if (capIds.length < 2) continue

    const placements = capIds
      .map((id) => ({
        id,
        placement: layout.chipPlacements[id],
        chip: testProblem.chipMap[id],
      }))
      .sort((a, b) => a.placement!.x - b.placement!.x)

    // Verify gaps between adjacent caps
    for (let i = 1; i < placements.length; i++) {
      const prev = placements[i - 1]!
      const curr = placements[i]!

      const prevRightEdge = prev.placement!.x + prev.chip!.size.x / 2
      const currLeftEdge = curr.placement!.x - curr.chip!.size.x / 2
      const actualGap = currLeftEdge - prevRightEdge

      expect(actualGap).toBeCloseTo(testGap, 3)
    }
  }
})
