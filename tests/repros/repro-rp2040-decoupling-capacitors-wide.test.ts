import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro-rp2040-decoupling-capacitors-wide.input.json"

// Repro for the RP2040 decoupling capacitors being stacked into a single tall
// column instead of being packed into rail rows.
//
// Same circuit as repro-rp2040-decoupling-capacitors, but the InputProblem is
// re-captured from a newer @tscircuit/core, which reports a different schematic
// body for the caps:
//
//                 old (rail rows)      new (tall column)
//   C12 size      1.08 x 1.10          1.165 x 0.76
//   C12 pins      (0.275, +/-0.55)     (0, +/-0.3)
//
// The pins still sit on the vertical axis, but the body went from portrait to
// landscape. Nets, strong connections and the gap settings are unchanged.
//
// The six IOVDD caps (C12, C14, C8, C13, C15, C19) plus C18/C7 all end up at
// x = -4.39, stacked along y at size.y + decouplingCapsGap. The spacing itself
// is right for a column -- the bug is that a column is chosen at all.
test("repro50 rp2040 decoupling capacitors stack into a column when caps are wide", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const placements = solver.getOutputLayout().chipPlacements
  const iovddCaps = ["C12", "C14", "C8", "C13", "C15", "C19"]
  const xs = new Set(iovddCaps.map((id) => placements[id]!.x.toFixed(2)))

  // Every IOVDD cap shares one x -- they are in a column, not a row.
  expect(xs.size).toBe(1)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1000,
    svgHeight: 800,
  })
})
