import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/debug-leds-section.input.json"

test("reproduces debug LEDs section layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  const placements = solver.getOutputLayout().chipPlacements
  for (const [ledId, resistorId] of [
    ["LED4", "R15"],
    ["LED5", "R16"],
    ["LED6", "R17"],
  ] as const) {
    expect(placements[ledId]!.x).toBeCloseTo(placements[resistorId]!.x)
    expect(placements[ledId]!.y).toBeGreaterThan(placements[resistorId]!.y)
  }
  expect(placements.LED4!.y).toBeCloseTo(placements.LED5!.y)
  expect(placements.LED5!.y).toBeCloseTo(placements.LED6!.y)

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})

test("aligns grounded load rows when an unrelated chip is present", () => {
  const inputWithUnrelatedChip = structuredClone(input) as InputProblem
  inputWithUnrelatedChip.chipMap.C_EXTRA = {
    chipId: "C_EXTRA",
    pins: ["C_EXTRA.1", "C_EXTRA.2"],
    size: { x: 0.8, y: 0.5 },
    isCapacitor: true,
    availableRotations: [0, 90],
    fixedPosition: { x: 10, y: 10 },
  }
  inputWithUnrelatedChip.chipPinMap["C_EXTRA.1"] = {
    pinId: "C_EXTRA.1",
    offset: { x: -0.4, y: 0 },
    side: "x-",
  }
  inputWithUnrelatedChip.chipPinMap["C_EXTRA.2"] = {
    pinId: "C_EXTRA.2",
    offset: { x: 0.4, y: 0 },
    side: "x+",
  }
  inputWithUnrelatedChip.netMap.EXTRA1 = {
    netId: "EXTRA1",
    isGround: false,
    isPositiveVoltageSource: false,
  }
  inputWithUnrelatedChip.netMap.EXTRA2 = {
    netId: "EXTRA2",
    isGround: false,
    isPositiveVoltageSource: false,
  }
  inputWithUnrelatedChip.netConnMap["C_EXTRA.1-EXTRA1"] = true
  inputWithUnrelatedChip.netConnMap["C_EXTRA.2-EXTRA2"] = true

  const solver = new LayoutPipelineSolver(inputWithUnrelatedChip)
  solver.solve()

  const placements = solver.getOutputLayout().chipPlacements
  for (const [ledId, resistorId] of [
    ["LED4", "R15"],
    ["LED5", "R16"],
    ["LED6", "R17"],
  ] as const) {
    expect(placements[ledId]!.x).toBeCloseTo(placements[resistorId]!.x)
    expect(placements[ledId]!.y).toBeGreaterThan(placements[resistorId]!.y)
  }
  expect(placements.LED4!.y).toBeCloseTo(placements.LED5!.y)
  expect(placements.LED5!.y).toBeCloseTo(placements.LED6!.y)
  expect(placements.C_EXTRA).toMatchObject({ x: 10, y: 10 })
})
