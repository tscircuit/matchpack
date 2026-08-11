import { getBoundFromCenteredRect } from "@tscircuit/math-utils"
import type { ChipId, InputProblem, NetId } from "../../types/InputProblem"
import type { Placement } from "../../types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import type { GroundedLoadPair } from "./getGroundedLoadPairs"

type GroundedLoadPairBounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

const MINIMUM_PAIRS_PER_ROW = 2

const getGroundNetId = ({
  groundedLoadPair,
  inputProblem,
}: {
  groundedLoadPair: GroundedLoadPair
  inputProblem: InputProblem
}): NetId | undefined => {
  for (const netId of Object.keys(inputProblem.netMap)) {
    if (!inputProblem.netMap[netId]?.isGround) continue
    if (inputProblem.netConnMap[`${groundedLoadPair.groundPinId}-${netId}`]) {
      return netId
    }
  }
}

const getPairBounds = ({
  groundedLoadPair,
  chipPlacements,
  inputProblem,
}: {
  groundedLoadPair: GroundedLoadPair
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): GroundedLoadPairBounds | null => {
  const chipIds = [
    groundedLoadPair.upperChip.chipId,
    groundedLoadPair.lowerChip.chipId,
  ]
  const chipBounds = chipIds.flatMap((chipId) => {
    const chip = inputProblem.chipMap[chipId]
    const placement = chipPlacements[chipId]
    if (!chip || !placement) return []
    const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
    return [
      getBoundFromCenteredRect({
        center: placement,
        width: size.x,
        height: size.y,
      }),
    ]
  })
  if (chipBounds.length !== chipIds.length) return null

  return {
    minX: Math.min(...chipBounds.map((bounds) => bounds.minX)),
    maxX: Math.max(...chipBounds.map((bounds) => bounds.maxX)),
    minY: Math.min(...chipBounds.map((bounds) => bounds.minY)),
    maxY: Math.max(...chipBounds.map((bounds) => bounds.maxY)),
  }
}

const getGroundPinY = ({
  groundedLoadPair,
  chipPlacements,
  inputProblem,
}: {
  groundedLoadPair: GroundedLoadPair
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): number | undefined => {
  const placement = chipPlacements[groundedLoadPair.lowerChip.chipId]
  const groundPin = inputProblem.chipPinMap[groundedLoadPair.groundPinId]
  if (!placement || !groundPin) return
  const groundPinOffset = rotatePinOffset(
    groundPin.offset,
    placement.ccwRotationDegrees,
  )
  return placement.y + groundPinOffset.y
}

const translateGroundedLoadPair = ({
  groundedLoadPair,
  chipPlacements,
  dx,
  dy,
}: {
  groundedLoadPair: GroundedLoadPair
  chipPlacements: Record<ChipId, Placement>
  dx: number
  dy: number
}): void => {
  for (const chipId of [
    groundedLoadPair.upperChip.chipId,
    groundedLoadPair.lowerChip.chipId,
  ]) {
    const placement = chipPlacements[chipId]
    if (!placement) continue
    placement.x += dx
    placement.y += dy
  }
}

const alignGroundedLoadPairRow = ({
  groundedLoadPairs,
  chipPlacements,
  inputProblem,
}: {
  groundedLoadPairs: GroundedLoadPair[]
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): void => {
  const orderedPairs = [...groundedLoadPairs].sort((pairA, pairB) => {
    const boundsA = getPairBounds({
      groundedLoadPair: pairA,
      chipPlacements,
      inputProblem,
    })
    const boundsB = getPairBounds({
      groundedLoadPair: pairB,
      chipPlacements,
      inputProblem,
    })
    if (!boundsA || !boundsB) return 0
    return boundsA.minX - boundsB.minX
  })
  const initialGroundPinYs = orderedPairs.flatMap((groundedLoadPair) => {
    const groundPinY = getGroundPinY({
      groundedLoadPair,
      chipPlacements,
      inputProblem,
    })
    if (groundPinY === undefined) return []
    return [groundPinY]
  })
  if (initialGroundPinYs.length !== orderedPairs.length) return

  const targetGroundPinY = Math.min(...initialGroundPinYs)
  for (const groundedLoadPair of orderedPairs) {
    const groundPinY = getGroundPinY({
      groundedLoadPair,
      chipPlacements,
      inputProblem,
    })
    if (groundPinY === undefined) continue
    translateGroundedLoadPair({
      groundedLoadPair,
      chipPlacements,
      dx: 0,
      dy: targetGroundPinY - groundPinY,
    })
  }

  let previousPairMaxX: number | undefined
  for (const groundedLoadPair of orderedPairs) {
    const pairBounds = getPairBounds({
      groundedLoadPair,
      chipPlacements,
      inputProblem,
    })
    if (!pairBounds) continue
    if (previousPairMaxX === undefined) {
      previousPairMaxX = pairBounds.maxX
      continue
    }
    const dx = previousPairMaxX + inputProblem.partitionGap - pairBounds.minX
    translateGroundedLoadPair({
      groundedLoadPair,
      chipPlacements,
      dx,
      dy: 0,
    })
    previousPairMaxX = pairBounds.maxX + dx
  }

  const pairedChipIds = new Set(
    orderedPairs.flatMap((groundedLoadPair) => [
      groundedLoadPair.upperChip.chipId,
      groundedLoadPair.lowerChip.chipId,
    ]),
  )
  let downwardShift = 0
  for (const groundedLoadPair of orderedPairs) {
    const pairBounds = getPairBounds({
      groundedLoadPair,
      chipPlacements,
      inputProblem,
    })
    if (!pairBounds) continue
    for (const [chipId, placement] of Object.entries(chipPlacements)) {
      if (pairedChipIds.has(chipId)) continue
      const chip = inputProblem.chipMap[chipId]
      if (!chip) continue
      if (chip.isTestPoint) continue
      const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
      const chipBounds = getBoundFromCenteredRect({
        center: placement,
        width: size.x,
        height: size.y,
      })
      const separatedOnX =
        pairBounds.maxX + inputProblem.chipGap <= chipBounds.minX ||
        pairBounds.minX - inputProblem.chipGap >= chipBounds.maxX
      if (separatedOnX) continue
      const requiredDownwardShift =
        pairBounds.maxY + inputProblem.chipGap - chipBounds.minY
      downwardShift = Math.max(downwardShift, requiredDownwardShift)
    }
  }

  if (downwardShift === 0) return
  for (const groundedLoadPair of orderedPairs) {
    translateGroundedLoadPair({
      groundedLoadPair,
      chipPlacements,
      dx: 0,
      dy: -downwardShift,
    })
  }
}

export const alignGroundedLoadPairRows = ({
  groundedLoadPairs,
  chipPlacements,
  inputProblem,
}: {
  groundedLoadPairs: GroundedLoadPair[]
  chipPlacements: Record<ChipId, Placement>
  inputProblem: InputProblem
}): void => {
  const pairsByGroundNetId = new Map<NetId, GroundedLoadPair[]>()
  for (const groundedLoadPair of groundedLoadPairs) {
    if (groundedLoadPair.mainChipId) continue
    const groundNetId = getGroundNetId({ groundedLoadPair, inputProblem })
    if (!groundNetId) continue
    const rowPairs = pairsByGroundNetId.get(groundNetId) ?? []
    rowPairs.push(groundedLoadPair)
    pairsByGroundNetId.set(groundNetId, rowPairs)
  }

  for (const rowPairs of pairsByGroundNetId.values()) {
    if (rowPairs.length < MINIMUM_PAIRS_PER_ROW) continue
    alignGroundedLoadPairRow({
      groundedLoadPairs: rowPairs,
      chipPlacements,
      inputProblem,
    })
  }
}
