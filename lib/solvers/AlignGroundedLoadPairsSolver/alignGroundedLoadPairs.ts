import type { InputProblem } from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { getVerticalPinClearanceOffset } from "../../utils/getVerticalPinClearanceOffset"
import { tryOffsetChips } from "../../utils/offsetCollinearConnections"
import { rotatePinOffset } from "../../utils/rotatePinOffset"
import { getPlacementBounds } from "../AlignTestPointsSolver/placementsOverlap"
import type { GroundedLoadPair } from "../GroundedLoadPairSolver/getGroundedLoadPairs"

const SIDE_DIRECTIONS = {
  "x-": { x: -1, y: 0 },
  "x+": { x: 1, y: 0 },
  "y-": { x: 0, y: -1 },
  "y+": { x: 0, y: 1 },
}
const MINIMUM_SIDE_PAIRS = 2

export const alignGroundedLoadPairs = ({
  inputProblem,
  inputLayout,
  groundedLoadPairs,
}: {
  inputProblem: InputProblem
  inputLayout: OutputLayout
  groundedLoadPairs: GroundedLoadPair[]
}): OutputLayout => {
  const outputLayout = structuredClone(inputLayout)
  const { chipPlacements } = outputLayout
  const remainingPairs = new Set(groundedLoadPairs)
  for (const pair of remainingPairs) {
    if (!pair.mainChipId || !pair.mainPinId) continue
    const mainPin = inputProblem.chipPinMap[pair.mainPinId]!
    const sidePairs = groundedLoadPairs.filter(
      (candidate) =>
        candidate.mainChipId === pair.mainChipId &&
        candidate.mainPinId &&
        inputProblem.chipPinMap[candidate.mainPinId]!.side === mainPin.side,
    )
    if (sidePairs.length < MINIMUM_SIDE_PAIRS) continue
    const mainPlacement = chipPlacements[pair.mainChipId]!
    const direction = rotatePinOffset(
      SIDE_DIRECTIONS[mainPin.side],
      mainPlacement.ccwRotationDegrees,
    )
    if (Math.abs(direction.x) < 0.5) continue
    // Place the lowest pin nearest a left-side IC, so the row steps down
    // from left to right in the same order as the IC pins.
    sidePairs.sort((first, second) => {
      const firstOffset = rotatePinOffset(
        inputProblem.chipPinMap[first.mainPinId!]!.offset,
        mainPlacement.ccwRotationDegrees,
      )
      const secondOffset = rotatePinOffset(
        inputProblem.chipPinMap[second.mainPinId!]!.offset,
        mainPlacement.ccwRotationDegrees,
      )
      return (secondOffset.y - firstOffset.y) * direction.x
    })
    const mainBounds = getPlacementBounds({
      placement: mainPlacement,
      size: inputProblem.chipMap[pair.mainChipId]!.size,
    })
    let rowOutsideEdge: number | undefined
    for (const pair of sidePairs) {
      remainingPairs.delete(pair)
      const mainPin = inputProblem.chipPinMap[pair.mainPinId!]!
      const chipIds = [pair.upperChip.chipId, pair.lowerChip.chipId]
      // Unplaced row members will move outward next; their old positions
      // must not push the first branch away from the chip.
      const clearanceGroupChipIds = sidePairs
        .filter(
          (candidate) => candidate === pair || remainingPairs.has(candidate),
        )
        .flatMap((candidate) => [
          candidate.upperChip.chipId,
          candidate.lowerChip.chipId,
        ])
      const upperPlacement = chipPlacements[pair.upperChip.chipId]!
      const dy = getVerticalPinClearanceOffset({
        upperPin: mainPin,
        upperPlacement: mainPlacement,
        lowerPin: inputProblem.chipPinMap[pair.upperOuterPinId]!,
        lowerPlacement: upperPlacement,
      })
      const pairBounds = chipIds.map((chipId) =>
        getPlacementBounds({
          placement: chipPlacements[chipId]!,
          size: inputProblem.chipMap[chipId]!.size,
        }),
      )
      const minX = Math.min(...pairBounds.map((bounds) => bounds.minX))
      const maxX = Math.max(...pairBounds.map((bounds) => bounds.maxX))
      let sideShift = Math.max(0, mainBounds.maxX + inputProblem.chipGap - minX)
      if (direction.x < 0) {
        sideShift = Math.min(0, mainBounds.minX - inputProblem.chipGap - maxX)
      }
      if (rowOutsideEdge !== undefined) {
        if (direction.x < 0) {
          sideShift = Math.min(
            sideShift,
            rowOutsideEdge - inputProblem.chipGap - maxX,
          )
        } else {
          sideShift = Math.max(
            sideShift,
            rowOutsideEdge + inputProblem.chipGap - minX,
          )
        }
      }

      // Try the nearest position first, then obstacle edges farther from the IC.
      const candidateShifts = [sideShift]
      for (const [chipId, placement] of Object.entries(chipPlacements)) {
        if (clearanceGroupChipIds.includes(chipId)) continue
        const bounds = getPlacementBounds({
          placement,
          size: inputProblem.chipMap[chipId]!.size,
        })
        let dx = bounds.maxX + inputProblem.chipGap - minX
        if (direction.x < 0) dx = bounds.minX - inputProblem.chipGap - maxX
        if (dx * direction.x < sideShift * direction.x) continue
        candidateShifts.push(dx)
      }
      candidateShifts.sort((a, b) => Math.abs(a) - Math.abs(b))
      for (const dx of candidateShifts) {
        if (
          tryOffsetChips({
            chipIds,
            clearanceGroupChipIds,
            dx,
            dy,
            chipPlacements,
            inputProblem,
          })
        ) {
          rowOutsideEdge = maxX + dx
          if (direction.x < 0) rowOutsideEdge = minX + dx
          break
        }
      }
    }
  }
  return outputLayout
}
