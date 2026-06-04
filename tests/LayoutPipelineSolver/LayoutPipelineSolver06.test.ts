import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { problem } from "../../pages/LayoutPipelineSolver/LayoutPipelineSolver06.page"

test("LayoutPipelineSolver06 lays out decoupling capacitors as uniform banks", async () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const layout = solver.getOutputLayout()

  // Both decoupling cap groups identified on U3
  const decapGroups =
    solver.identifyDecouplingCapsSolver!.outputDecouplingCapGroups
  expect(decapGroups.length).toBe(2)

  const gap = problem.decouplingCapsGap!

  for (const group of decapGroups) {
    const placements = group.decouplingCapChipIds.map(
      (chipId) => layout.chipPlacements[chipId]!,
    )

    // Every cap in the group has the same orientation (VCC pin facing y+)
    const rotations = new Set(placements.map((p) => p.ccwRotationDegrees))
    expect(rotations.size).toBe(1)

    // All caps in the bank sit on the same row (same y)
    const ys = new Set(placements.map((p) => p.y.toFixed(5)))
    expect(ys.size).toBe(1)

    // Caps are ordered deterministically by chip id (natural sort) and
    // spaced with a uniform pitch of cap width + decouplingCapsGap
    const sortedChipIds = [...group.decouplingCapChipIds].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    )
    const xs = sortedChipIds.map((chipId) => layout.chipPlacements[chipId]!.x)
    const capWidth = problem.chipMap[sortedChipIds[0]!]!.size.x
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!).toBeCloseTo(capWidth + gap, 5)
    }
  }

  // No overlapping components in the final layout
  const overlaps = solver.checkForOverlaps(layout)
  expect(overlaps.length).toBe(0)

  await expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path)
})
