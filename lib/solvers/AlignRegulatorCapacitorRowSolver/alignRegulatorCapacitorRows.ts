import type { Bounds } from "@tscircuit/math-utils"
import type {
  Chip,
  ChipId,
  ChipPin,
  InputProblem,
  NetId,
  PinId,
} from "../../types/InputProblem"
import type { OutputLayout } from "../../types/OutputLayout"
import { tryOffsetChips } from "../../utils/offsetCollinearConnections"
import { getVerticalPinClearanceOffset } from "../../utils/getVerticalPinClearanceOffset"
import { getPlacementBounds } from "../AlignTestPointsSolver/placementsOverlap"

type RailCapacitorGroup = {
  railNetId: NetId
  capacitorChipIds: ChipId[]
}

type RegulatorCapacitorRow = {
  regulatorChipId: ChipId
  left: RailCapacitorGroup
  right: RailCapacitorGroup
}

type LayoutContext = {
  inputProblem: InputProblem
  layout: OutputLayout
}

const getPinNetIds = (pinId: PinId, inputProblem: InputProblem): NetId[] =>
  Object.keys(inputProblem.netMap).filter(
    (netId) => inputProblem.netConnMap[`${pinId}-${netId}`],
  )

const getChipNetIds = (chip: Chip, inputProblem: InputProblem): Set<NetId> =>
  new Set(chip.pins.flatMap((pinId) => getPinNetIds(pinId, inputProblem)))

const getRailPin = (
  { chipId, railNetId }: { chipId: ChipId; railNetId: NetId },
  inputProblem: InputProblem,
): ChipPin | null => {
  const pinId = inputProblem.chipMap[chipId]?.pins.find((candidatePinId) =>
    getPinNetIds(candidatePinId, inputProblem).includes(railNetId),
  )
  if (!pinId) return null
  return inputProblem.chipPinMap[pinId] ?? null
}

const getChipBounds = (
  chipId: ChipId,
  { inputProblem, layout }: LayoutContext,
): Bounds | null => {
  const chip = inputProblem.chipMap[chipId]
  const placement = layout.chipPlacements[chipId]
  if (!chip || !placement) return null
  return getPlacementBounds({ placement, size: chip.size })
}

const getAverageX = (chipIds: ChipId[], layout: OutputLayout): number =>
  chipIds.reduce((sum, chipId) => sum + layout.chipPlacements[chipId]!.x, 0) /
  chipIds.length

const getRailCapacitors = (
  { groundNetId, railNetId }: { groundNetId: NetId; railNetId: NetId },
  { inputProblem, layout }: LayoutContext,
): ChipId[] =>
  Object.values(inputProblem.chipMap)
    .filter((chip) => {
      if (!chip.isCapacitor || chip.fixedPosition || chip.pins.length !== 2) {
        return false
      }
      if (!layout.chipPlacements[chip.chipId]) return false
      const netIds = getChipNetIds(chip, inputProblem)
      return (
        netIds.size === 2 && netIds.has(groundNetId) && netIds.has(railNetId)
      )
    })
    .map((chip) => chip.chipId)

// V1 handles the first movable three-pin regulator with one ground and two powered rails.
const getRegulatorCapacitorRow = (
  regulator: Chip,
  context: LayoutContext,
): RegulatorCapacitorRow | null => {
  const { inputProblem, layout } = context
  if (regulator.fixedPosition || regulator.pins.length !== 3) {
    return null
  }
  const regulatorPlacement = layout.chipPlacements[regulator.chipId]
  if (!regulatorPlacement) return null

  const netIds = [...getChipNetIds(regulator, inputProblem)]
  const groundNetIds = netIds.filter(
    (netId) => inputProblem.netMap[netId]?.isGround,
  )
  const railNetIds = netIds.filter(
    (netId) => inputProblem.netMap[netId]?.isPositiveVoltageSource,
  )
  if (groundNetIds.length !== 1 || railNetIds.length !== 2) return null

  const railGroups = railNetIds.map((railNetId) => ({
    railNetId,
    capacitorChipIds: getRailCapacitors(
      { groundNetId: groundNetIds[0]!, railNetId },
      context,
    ),
  }))
  if (railGroups.some((group) => group.capacitorChipIds.length === 0)) {
    return null
  }

  const left = railGroups.find(
    (group) =>
      getAverageX(group.capacitorChipIds, layout) < regulatorPlacement.x,
  )
  const right = railGroups.find(
    (group) =>
      getAverageX(group.capacitorChipIds, layout) > regulatorPlacement.x,
  )
  if (!left || !right) return null

  left.capacitorChipIds.sort(
    (chipA, chipB) =>
      layout.chipPlacements[chipA]!.x - layout.chipPlacements[chipB]!.x,
  )
  right.capacitorChipIds.sort(
    (chipA, chipB) =>
      layout.chipPlacements[chipA]!.x - layout.chipPlacements[chipB]!.x,
  )
  return { regulatorChipId: regulator.chipId, left, right }
}

const placeCapacitorGroup = (
  {
    group,
    regulatorChipId,
    startX,
    xDirection,
  }: {
    group: RailCapacitorGroup
    regulatorChipId: ChipId
    startX: number
    xDirection: -1 | 1
  },
  context: LayoutContext,
): boolean => {
  const { inputProblem, layout } = context
  const regulatorPlacement = layout.chipPlacements[regulatorChipId]
  const regulatorPin = getRailPin(
    { chipId: regulatorChipId, railNetId: group.railNetId },
    inputProblem,
  )
  if (!regulatorPlacement || !regulatorPin) return false

  const capacitorChipIds = [...group.capacitorChipIds]
  if (xDirection < 0) capacitorChipIds.reverse()
  const capacitorGap = inputProblem.decouplingCapsGap ?? inputProblem.chipGap
  let cursorX = startX

  for (const chipId of capacitorChipIds) {
    const placement = layout.chipPlacements[chipId]
    const bounds = getChipBounds(chipId, context)
    const capacitorPin = getRailPin(
      { chipId, railNetId: group.railNetId },
      inputProblem,
    )
    if (!placement || !bounds || !capacitorPin) return false

    const width = bounds.maxX - bounds.minX
    layout.chipPlacements[chipId] = {
      ...placement,
      x: cursorX + (xDirection * width) / 2,
      y:
        placement.y +
        getVerticalPinClearanceOffset({
          upperPin: regulatorPin,
          upperPlacement: regulatorPlacement,
          lowerPin: capacitorPin,
          lowerPlacement: placement,
        }),
    }
    cursorX += xDirection * (width + capacitorGap)
  }
  return true
}

const placeRow = (
  row: RegulatorCapacitorRow,
  context: LayoutContext,
): boolean => {
  const regulatorBounds = getChipBounds(row.regulatorChipId, context)
  if (!regulatorBounds) return false

  const leftWasPlaced = placeCapacitorGroup(
    {
      group: row.left,
      regulatorChipId: row.regulatorChipId,
      startX: regulatorBounds.minX - context.inputProblem.chipGap,
      xDirection: -1,
    },
    context,
  )
  if (!leftWasPlaced) return false
  return placeCapacitorGroup(
    {
      group: row.right,
      regulatorChipId: row.regulatorChipId,
      startX: regulatorBounds.maxX + context.inputProblem.chipGap,
      xDirection: 1,
    },
    context,
  )
}

// Keep this power stage left of downstream blockers; tryOffsetChips validates the final gap.
const getLeftwardClearanceOffset = (
  rowChipIds: ChipId[],
  context: LayoutContext,
): number => {
  const { inputProblem, layout } = context
  const rowChipIdSet = new Set(rowChipIds)
  const rowBounds = rowChipIds.map((chipId) => getChipBounds(chipId, context)!)
  const minX = Math.min(...rowBounds.map((bounds) => bounds.minX))
  const minY = Math.min(...rowBounds.map((bounds) => bounds.minY))
  const maxX = Math.max(...rowBounds.map((bounds) => bounds.maxX))
  const maxY = Math.max(...rowBounds.map((bounds) => bounds.maxY))
  const centerX = (minX + maxX) / 2
  let offsetX = 0

  for (const chipId of Object.keys(layout.chipPlacements)) {
    if (rowChipIdSet.has(chipId)) continue
    const bounds = getChipBounds(chipId, context)
    if (!bounds || (bounds.minX + bounds.maxX) / 2 <= centerX) continue
    const verticalGap = Math.max(bounds.minY - maxY, minY - bounds.maxY, 0)
    if (verticalGap >= inputProblem.partitionGap) continue
    offsetX = Math.min(offsetX, bounds.minX - inputProblem.partitionGap - maxX)
  }
  return offsetX
}

export const alignRegulatorCapacitorRows = (
  inputProblem: InputProblem,
  inputLayout: OutputLayout,
): OutputLayout => {
  const layout = structuredClone(inputLayout)
  const context = { inputProblem, layout }
  const row = Object.values(inputProblem.chipMap)
    .map((chip) => getRegulatorCapacitorRow(chip, context))
    .find((candidateRow) => candidateRow !== null)
  if (!row) return layout

  const rowChipIds = [
    ...row.left.capacitorChipIds,
    row.regulatorChipId,
    ...row.right.capacitorChipIds,
  ]
  const rowWasPlaced = placeRow(row, context)
  if (!rowWasPlaced) return inputLayout

  const offsetX = getLeftwardClearanceOffset(rowChipIds, context)
  if (
    !tryOffsetChips({
      chipIds: rowChipIds,
      clearanceGroupChipIds: rowChipIds,
      dx: offsetX,
      dy: 0,
      chipPlacements: layout.chipPlacements,
      inputProblem,
      minimumOutsideGap: inputProblem.partitionGap,
    })
  ) {
    return inputLayout
  }

  return layout
}
