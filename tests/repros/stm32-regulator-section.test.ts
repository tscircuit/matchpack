import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/stm32-regulator-section.input.json"

// C1: VBUS–GND, C2: V3V3–GND; U1: left GND/VO(V3V3), right VI(VBUS).
test("STM32 regulator with input and output capacitors and power LED", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  const placements = solver.getOutputLayout().chipPlacements
  expect(placements.C1!.x).toBeGreaterThan(placements.U1!.x)
  expect(placements.C2!.x).toBeLessThan(placements.U1!.x)
  expect(solver.checkForOverlaps(solver.getOutputLayout())).toEqual([])

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})

test("keeps a directly wired singleton capacitor with its chip", () => {
  const inputProblem = structuredClone(input) as InputProblem
  inputProblem.pinStrongConnMap["C1.1-U1.3"] = true
  inputProblem.pinStrongConnMap["U1.3-C1.1"] = true
  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()

  const mainPartition = solver.chipPartitions!.find(
    (partition) => partition.chipMap.U1,
  )!
  expect(Object.keys(mainPartition.chipMap).sort()).toEqual(["C1", "U1"])
})
