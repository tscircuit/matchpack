import { test, expect } from "bun:test"
import { IdentifyDecouplingCapsSolver } from "../../lib/solvers/IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import { problem } from "../../pages/LayoutPipelineSolver/LayoutPipelineSolver06.problem"

test("IdentifyDecouplingCapsSolver identifies decoupling capacitor groups from LayoutPipelineSolver06", () => {
  const solver = new IdentifyDecouplingCapsSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)

  console.log("Decoupling Cap Groups:")
  for (const group of solver.outputDecouplingCapGroups) {
    console.log(`  Group ID: ${group.decouplingCapGroupId}`)
    console.log(`  Main Chip: ${group.mainChipId}`)
    console.log(`  Net Pair: [${group.netPair.join(", ")}]`)
    console.log(
      `  Decoupling Capacitors: [${group.decouplingCapChipIds.join(", ")}]`,
    )
    console.log()
  }

  // Basic validation that the solver produced some groups
  expect(solver.outputDecouplingCapGroups.length).toBeGreaterThan(0)

  // Ensure all groups have valid structure
  for (const group of solver.outputDecouplingCapGroups) {
    expect(group.decouplingCapGroupId).toBeTruthy()
    expect(group.mainChipId).toBeTruthy()
    expect(group.netPair).toHaveLength(2)
    expect(group.decouplingCapChipIds.length).toBeGreaterThan(0)
  }
})
