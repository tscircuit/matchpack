import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import input from "../assets/mtr-usb-safety.input.json"

// Captured from Core's matchpack-input-problem debug output for
// tests/repros/repro-mtr-usb-safety-rc-detour.test.tsx.
// The eight-component section preserves mtr-tiny-md v0.0.4 connectivity
// and schematic margins; external sheet connections end at their named nets.
// Source: https://tscircuit.com/krishnax12/mtr-tiny-md (lib/usb-pd.tsx).
// Package release: f7ef0601-7e6e-4713-a579-e8bc42ec60f0.
test("repro MTR USB-safety parallel RC terminal orientation", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  // GATE_SAFE joins R10.1 to C43.2; DRAIN_1_SAFE joins R10.2 to C43.1.
  // The snapshot records matching nets facing opposite sides, which leads
  // to the C43 trace detour when Core routes the schematic.
  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
