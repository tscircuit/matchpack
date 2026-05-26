import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { problem } from "../../pages/LayoutPipelineSolver/LayoutPipelineSolver06.page"

test("LayoutPipelineSolver produces clean linear layout for decoupling capacitors", () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)

  const finalLayout = solver.getOutputLayout()
  expect(finalLayout).toBeDefined()

  const capChipIds = [
    "C7",
    "C8",
    "C9",
    "C10",
    "C11",
    "C12",
    "C13",
    "C14",
    "C15",
    "C18",
    "C19",
  ]

  // All capacitor chips should have placements
  for (const chipId of capChipIds) {
    expect(finalLayout.chipPlacements[chipId]).toBeDefined()
  }

  // Verify decoupling caps are placed in a clean linear row (all same y)
  const capPlacements = capChipIds
    .map((id) => finalLayout.chipPlacements[id])
    .filter(Boolean)

  expect(capPlacements.length).toBeGreaterThan(0)

  // Sorted by x position
  const sortedX = [...new Set(capPlacements.map((p) => p.x))].sort(
    (a, b) => a - b,
  )

  // All decoupling caps should be in a single row (y=0) since our
  // specialized layout centers them at origin
  for (const placement of capPlacements) {
    expect(placement.y).toBe(0)
  }

  // Verify the main chip (U3) has a placement
  expect(finalLayout.chipPlacements["U3"]).toBeDefined()

  // Check no overlaps
  const overlaps = solver.checkForOverlaps(finalLayout)
  expect(overlaps.length).toBe(0)

  console.log(`Decoupling caps placed in linear row: ${sortedX.length} positions`)
  for (const capId of capChipIds) {
    const p = finalLayout.chipPlacements[capId]
    if (p) {
      console.log(`  ${capId}: (${p.x.toFixed(4)}, ${p.y.toFixed(4)}) rot=${p.ccwRotationDegrees}`)
    }
  }
})
