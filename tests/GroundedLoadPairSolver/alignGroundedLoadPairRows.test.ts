import { expect, test } from "bun:test"
import { getPlacementBounds } from "lib/solvers/AlignTestPointsSolver/placementsOverlap"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { ChipId, InputProblem } from "lib/types/InputProblem"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import input from "../assets/rp2040-swd-status-led-layout.input.json"

const getPairHorizontalBounds = ({
  upperChipId,
  lowerChipId,
  inputProblem,
  solver,
}: {
  upperChipId: ChipId
  lowerChipId: ChipId
  inputProblem: InputProblem
  solver: LayoutPipelineSolver
}) => {
  const placements = solver.getOutputLayout().chipPlacements
  const bounds = [upperChipId, lowerChipId].map((chipId) =>
    getPlacementBounds({
      placement: placements[chipId]!,
      size: inputProblem.chipMap[chipId]!.size,
    }),
  )
  return {
    minX: Math.min(...bounds.map((bound) => bound.minX)),
    maxX: Math.max(...bounds.map((bound) => bound.maxX)),
  }
}

test("detects and aligns load pairs sharing ground", () => {
  const inputProblem = structuredClone(input) as InputProblem
  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()
  const placements = solver.getOutputLayout().chipPlacements
  const groundedLoadPairs = solver.groundedLoadPairSolver!.groundedLoadPairs
  expect(
    new Set(
      groundedLoadPairs.map(
        (groundedLoadPair) => groundedLoadPair.lowerChip.chipId,
      ),
    ),
  ).toEqual(new Set(["SW_RUN", "SW_BOOT", "D1", "D_PWR"]))
  const groundPinYs = groundedLoadPairs.map((groundedLoadPair) => {
    const placement = placements[groundedLoadPair.lowerChip.chipId]!
    const groundPin = inputProblem.chipPinMap[groundedLoadPair.groundPinId]!
    return (
      placement.y +
      rotatePinOffset(groundPin.offset, placement.ccwRotationDegrees).y
    )
  })
  expect(Math.max(...groundPinYs) - Math.min(...groundPinYs)).toBeCloseTo(0)

  const pairBounds = [
    ["R_RUN", "SW_RUN"],
    ["R_BOOT", "SW_BOOT"],
    ["R_PWR_LED", "D_PWR"],
    ["R_LED", "D1"],
  ]
    .map(([upperChipId, lowerChipId]) =>
      getPairHorizontalBounds({
        upperChipId: upperChipId!,
        lowerChipId: lowerChipId!,
        inputProblem,
        solver,
      }),
    )
    .sort((boundsA, boundsB) => boundsA.minX - boundsB.minX)
  for (let pairIndex = 1; pairIndex < pairBounds.length; pairIndex++) {
    expect(
      pairBounds[pairIndex]!.minX - pairBounds[pairIndex - 1]!.maxX,
    ).toBeCloseTo(inputProblem.partitionGap)
  }
})
