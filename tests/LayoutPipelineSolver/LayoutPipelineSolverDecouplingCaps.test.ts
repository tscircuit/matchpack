import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { problem } from "../../pages/LayoutPipelineSolver/LayoutPipelineSolver06.page.tsx"

test("LayoutPipelineSolver places decoupling capacitors beside their connected main-chip pins", () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.failed).toBe(false)
  const layout = solver.partitionPackingSolver!.finalLayout!
  const u3Placement = layout.chipPlacements.U3!
  const u3LeftEdge = u3Placement.x - problem.chipMap.U3!.size.x / 2

  const v33Group =
    solver.identifyDecouplingCapsSolver!.outputDecouplingCapGroups.find(
      (group) =>
        group.mainChipId === "U3" &&
        group.netPair.includes("GND") &&
        group.netPair.includes("V3_3"),
    )!

  const capPlacements = v33Group.decouplingCapChipIds.map((chipId) => ({
    chipId,
    placement: layout.chipPlacements[chipId]!,
  }))

  expect(capPlacements).toHaveLength(6)
  for (const { placement } of capPlacements) {
    expect(placement.x).toBeLessThan(u3LeftEdge - 0.1)
  }

  const capYs = capPlacements.map(({ placement }) => placement.y)
  const ySpread = Math.max(...capYs) - Math.min(...capYs)
  expect(ySpread).toBeGreaterThan(1)
})
