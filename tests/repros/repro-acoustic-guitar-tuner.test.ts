import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import input from "../assets/repro-acoustic-guitar-tuner.input.json"

// Captured by reapplying core's layout to exported Circuit JSON, without the original TSX props.
// Core: 5eee1add440ab66c8986b395cbd87ee00acad7b2; Matchpack: 32dad82ed2324dad4a994f4b88afbee58f73b7fc.
test("acoustic guitar tuner core layout repro", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()
  const placements = solver.getOutputLayout().chipPlacements
  const rightSideLedOrder = [
    "LED_TUNE",
    "LED_SHARP",
    "LED_FLAT",
    "LED_E4",
    "LED_B3",
  ]
  for (let index = 1; index < rightSideLedOrder.length; index++) {
    expect(placements[rightSideLedOrder[index - 1]!]!.x).toBeLessThan(
      placements[rightSideLedOrder[index]!]!.x,
    )
  }
  expect(solver.checkForOverlaps(solver.getOutputLayout())).toHaveLength(0)
  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1200,
    svgHeight: 600,
  })
})

test.each([0, 180] as const)(
  "grounded branches follow pin height outward on both sides at %i degrees",
  (ccwRotationDegrees) => {
    const inputProblem = structuredClone(input) as InputProblem
    inputProblem.chipMap.U2!.availableRotations = [ccwRotationDegrees]
    const solver = new LayoutPipelineSolver(inputProblem)
    solver.solve()
    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
    const placements = solver.getOutputLayout().chipPlacements
    const mainPlacement = placements.U2!
    const pairs = solver.groundedLoadPairSolver!.groundedLoadPairs.filter(
      (pair) => pair.mainChipId === "U2",
    )
    expect(pairs).toHaveLength(9)
    for (const side of ["x-", "x+"]) {
      const sidePairs = pairs
        .filter(
          (pair) => inputProblem.chipPinMap[pair.mainPinId!]!.side === side,
        )
        .sort(
          (first, second) =>
            rotatePinOffset(
              inputProblem.chipPinMap[first.mainPinId!]!.offset,
              mainPlacement.ccwRotationDegrees,
            ).y -
            rotatePinOffset(
              inputProblem.chipPinMap[second.mainPinId!]!.offset,
              mainPlacement.ccwRotationDegrees,
            ).y,
        )
      for (let index = 1; index < sidePairs.length; index++) {
        const nearPlacement =
          placements[sidePairs[index - 1]!.lowerChip.chipId]!
        const farPlacement = placements[sidePairs[index]!.lowerChip.chipId]!
        expect(Math.abs(nearPlacement.x - mainPlacement.x)).toBeLessThan(
          Math.abs(farPlacement.x - mainPlacement.x),
        )
      }
      for (const pair of sidePairs) {
        expect(placements[pair.upperChip.chipId]!.x).toBeCloseTo(
          placements[pair.lowerChip.chipId]!.x,
        )
      }
    }
    expect(solver.checkForOverlaps(solver.getOutputLayout())).toHaveLength(0)
  },
)
