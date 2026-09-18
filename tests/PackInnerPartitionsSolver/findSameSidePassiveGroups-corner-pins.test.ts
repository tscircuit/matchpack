import { expect, test } from "bun:test"
import { findSameSidePassiveGroups } from "lib/solvers/PackInnerPartitionsSolver/findSameSidePassiveGroups"
import { problem } from "../../pages/LayoutPipelineSolver/LayoutPipelineSolver06.page"

// https://github.com/tscircuit/matchpack/issues/15
//
// U3's decoupling caps all hang off its LEFT edge (every rail pin declares
// side "x-"), but side inference from pin offsets misclassified the corner
// pins: U3.44 sits near the top of the tall chip at offset (-1.9, 2.0), where
// |y| > |x| reads as "y+". That split the caps into an x- group and a phantom
// y+ group, so C10/C11/C7/C18 never joined the left-edge rows.
//
// The declared pin side is authoritative; offset inference is only a fallback.
test("corner pins keep their declared side when grouping same-side passives", () => {
  const groups = findSameSidePassiveGroups(problem as any)

  // All caps must land in x- groups — no phantom y+ group from corner pins
  expect(groups.every((group) => group.side === "x-")).toBe(true)

  const groupedCaps = new Set(groups.flatMap((group) => group.passiveChipIds))
  for (const capId of ["C10", "C11", "C7", "C18"]) {
    expect(groupedCaps.has(capId)).toBe(true)
  }
})
