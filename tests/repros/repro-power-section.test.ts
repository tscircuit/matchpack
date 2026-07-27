import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import inputProblem from "../assets/repro-power-section.input.json"

test("power section schematic auto-layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as InputProblem)
  solver.solve()

  const outputLayout = solver.getOutputLayout()
  const placements = outputLayout.chipPlacements
  const getPinPosition = (chipId: "C2" | "U3", pinId: "C2.1" | "U3.4") => {
    const placement = placements[chipId]!
    const pinOffset = rotatePinOffset(
      (inputProblem as InputProblem).chipPinMap[pinId]!.offset,
      placement.ccwRotationDegrees,
    )
    return {
      x: placement.x + pinOffset.x,
      y: placement.y + pinOffset.y,
    }
  }

  const u3BypassPin = getPinPosition("U3", "U3.4")
  const c2SignalPin = getPinPosition("C2", "C2.1")
  expect(u3BypassPin.y - c2SignalPin.y).toBeCloseTo(0.2)
  expect(solver.checkForOverlaps(outputLayout)).toEqual([])

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
