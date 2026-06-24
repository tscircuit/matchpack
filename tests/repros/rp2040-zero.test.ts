import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import group1Input from "./../assets/rp2040-zero-group1.input.json"
import group3Input from "./../assets/rp2040-zero-group3.input.json"
import crystalInput from "./../assets/rp2040-zero-crystal-group4.input.json"

// Captured from @tscircuit/core's "matchpack-input-problem-*" debug output for
// the seveibar/rp2040-zero project (tests/projects/seveibar__rp2040-zero). The
// project is hierarchical; each sub-group is laid out independently then packed.
// These are the per-sub-group *component-level* layouts (the board level only
// packs opaque group boxes, so it isn't reproduced here). group5 (RP2040 +
// decoupling caps) is identical to repro50 and lives in that test.
//   group1: U1 + C6/C1/C2/C5
//   group3: U2 (8-pin) + its decoupling cap C3
//   group4: crystal X1 + R8/C16/C17

const cases: Array<{ name: string; input: unknown }> = [
  { name: "group1", input: group1Input },
  { name: "group3", input: group3Input },
  { name: "crystal-group4", input: crystalInput },
]

for (const { name, input } of cases) {
  test(`rp2040-zero ${name} layout`, async () => {
    const solver = new LayoutPipelineSolver(input as any)
    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)

    await expect(solver).toMatchSolverSnapshot(import.meta.path, {
      svgName: name,
      svgWidth: 1000,
      svgHeight: 800,
    })
  })
}
