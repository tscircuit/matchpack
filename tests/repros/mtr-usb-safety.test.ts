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
test("MTR USB-safety parallel resistor and capacitor orientation", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  const outputLayout = solver.getOutputLayout()
  const { R10, C43 } = outputLayout.chipPlacements
  // GATE_SAFE joins R10.1 to C43.2; DRAIN_1_SAFE joins R10.2 to C43.1.
  // A half-turn puts corresponding nets on the same side without moving chips.
  expect(R10!.ccwRotationDegrees).toBe(0)
  expect(C43!.ccwRotationDegrees).toBe(180)
  expect(C43!.x - R10!.x).toBeCloseTo(-0.362, 6)
  expect(C43!.y - R10!.y).toBeCloseTo(-2.46, 6)
  const beforeOrientation =
    solver.alignRegulatorCapacitorRowSolver!.outputLayout!
  expect(beforeOrientation.chipPlacements.C43!.ccwRotationDegrees).toBe(0)
  expect(outputLayout).toEqual({
    ...beforeOrientation,
    chipPlacements: {
      ...beforeOrientation.chipPlacements,
      C43: {
        ...beforeOrientation.chipPlacements.C43!,
        ccwRotationDegrees: 180,
      },
    },
  })
  expect(solver.checkForOverlaps(outputLayout)).toEqual([])
  await expect(solver.alignRegulatorCapacitorRowSolver!).toMatchSolverSnapshot(
    import.meta.path,
    "before",
  )
  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
