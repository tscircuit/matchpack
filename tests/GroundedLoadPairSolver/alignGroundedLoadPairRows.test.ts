import { expect, test } from "bun:test"
import { getPlacementBounds } from "lib/solvers/AlignTestPointsSolver/placementsOverlap"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getNetIdsForPin } from "lib/solvers/GroundedLoadPairSolver/getGroundedLoadPairs"
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

test("groups shared-ground load pairs by positive rail", () => {
  const inputProblem = structuredClone(input) as InputProblem
  const ledSignalNetId = getNetIdsForPin({
    inputProblem,
    pinId: "R_LED.1",
  })[0]!
  inputProblem.netMap[ledSignalNetId]!.isPositiveVoltageSource = true

  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()
  const placements = solver.getOutputLayout().chipPlacements
  const groundedLoadPairs = solver.groundedLoadPairSolver!.groundedLoadPairs
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
  ].map(([upperChipId, lowerChipId]) =>
    getPairHorizontalBounds({
      upperChipId: upperChipId!,
      lowerChipId: lowerChipId!,
      inputProblem,
      solver,
    }),
  )
  expect(pairBounds[1]!.minX - pairBounds[0]!.maxX).toBeCloseTo(
    inputProblem.chipGap,
  )
  expect(pairBounds[2]!.minX - pairBounds[1]!.maxX).toBeCloseTo(
    inputProblem.chipGap,
  )
  expect(pairBounds[3]!.minX - pairBounds[2]!.maxX).toBeCloseTo(
    inputProblem.partitionGap,
  )
})
