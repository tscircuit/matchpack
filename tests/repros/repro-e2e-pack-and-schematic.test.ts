import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { boundsDistance } from "@tscircuit/math-utils"
import { getPlacementBounds } from "../../lib/solvers/AlignTestPointsSolver/placementsOverlap"
import { rotatePinOffset } from "../../lib/utils/rotatePinOffset"
import type { InputProblem } from "../../lib/types/InputProblem"
import inputProblem from "../assets/repro-e2e-pack-and-schematic.input.json"

// Captured from @tscircuit/core's "matchpack-input-problem-*" debug output for
// the repro44-e2e-pack-and-schematic test (555-timer style circuit: U1 + R1/R2/R3
// + C1/C2 + D1). Lets us inspect/iterate on matchpack's body-level layout here.
test("repro44 e2e pack and schematic layout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const placements = solver.getOutputLayout().chipPlacements
  const r1 = placements.R1!
  const r3 = placements.R3!
  const gap = boundsDistance(
    getPlacementBounds({ placement: r1, size: inputProblem.chipMap.R1!.size }),
    getPlacementBounds({ placement: r3, size: inputProblem.chipMap.R3!.size }),
  )
  expect(gap).toBeGreaterThanOrEqual(inputProblem.chipGap - 1e-6)
  expect(solver.checkForOverlaps(solver.getOutputLayout())).toHaveLength(0)

  expect(solver.groundedLoadPairSolver!.groundedLoadPairs).toHaveLength(1)
  const mainPlacement = placements.U1!
  const mainPin = inputProblem.chipPinMap["U1.3"]!
  const resistorPin = inputProblem.chipPinMap["R3.1"]!
  const mainPinY =
    mainPlacement.y +
    rotatePinOffset(mainPin.offset, mainPlacement.ccwRotationDegrees).y
  const resistorPinY =
    r3.y + rotatePinOffset(resistorPin.offset, r3.ccwRotationDegrees).y
  expect(mainPinY - resistorPinY).toBeCloseTo(0.2, 6)
  expect(r3.x).toBeCloseTo(placements.D1!.x, 6)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1000,
    svgHeight: 800,
  })
})
