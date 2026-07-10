import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro-rp2040-decoupling-capacitors-wide.input.json"

// Repro for the RP2040 decoupling capacitors stacking into one tall column
// instead of a rail row (@tscircuit/core repro50).
//
// Same circuit as repro-rp2040-decoupling-capacitors, but the InputProblem is
// captured from a newer @tscircuit/core, which ships a smaller cap symbol. Nets,
// strong connections and gaps are byte-identical; only chipMap[].size and
// chipPinMap[].offset changed:
//
//                old                 new (smaller symbol)
//   C12 size     1.08 x 1.10         1.165 x 0.76
//   C12 pins     (0.275, +/-0.55)    (0, +/-0.3)
//
// That flipped the cap body from portrait to landscape, and calculate-packing
// lines identical parts up along their body's shorter side, so the group became a
// column. (The body is landscape even with the labels stripped: a vertical cap's
// symbol is 0.9 x 0.6, wide plates and short leads. The value label widens it
// further but is not the trigger.)
//
// The caps' pin axis is vertical in both fixtures, so both must lay out as a row --
// that is the invariant this test and its portrait-bodied sibling pin down.
// DecouplingCapRowSolver takes the axis from the pins, so body size only sets the
// pitch.
test("repro50 rp2040 decoupling capacitors form a rail row when the cap body is landscape", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const placements = solver.getOutputLayout().chipPlacements
  const iovddCaps = ["C12", "C14", "C8", "C13", "C15", "C19"]

  // A rail row: every cap on one shared y, each at its own x.
  const distinctYs = new Set(
    iovddCaps.map((id) => placements[id]!.y.toFixed(2)),
  )
  const distinctXs = new Set(
    iovddCaps.map((id) => placements[id]!.x.toFixed(2)),
  )
  expect(distinctYs.size).toBe(1)
  expect(distinctXs.size).toBe(iovddCaps.length)

  // Evenly pitched at chip.size.x + decouplingCapsGap (1.165 + 0.4), i.e. the
  // value label still earns its horizontal room.
  const xs = iovddCaps.map((id) => placements[id]!.x).sort((a, b) => a - b)
  const pitches = xs.slice(1).map((x, i) => +(x - xs[i]!).toFixed(3))
  expect(new Set(pitches)).toEqual(new Set([1.565]))

  // The DVDD caps decouple a different rail (V1_1), so they form their own row.
  // C9 is a bulk cap wired only to that rail's nets -- it has no pin-to-pin link
  // to U3, but it decouples the same rail, so it belongs in the same row.
  const v1_1Caps = ["C18", "C7", "C9"]
  const v1_1Ys = new Set(v1_1Caps.map((id) => placements[id]!.y.toFixed(2)))
  expect(v1_1Ys.size).toBe(1)
  expect([...v1_1Ys][0]).not.toBe([...distinctYs][0])

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1000,
    svgHeight: 800,
  })
})
