/**
 * Detects "same-side passive groups" in either of two forms:
 *
 * - three or more 2-pin passives connected to distinct pins on one side of the
 *   same chip; or
 * - two or more parallel 2-pin passives whose near pins share one strong
 *   connectivity node and whose far pins share one net. The strong node must
 *   contain exactly one additional anchor pin (for example FB1.pin2 feeding
 *   C1/C3, whose other pins both connect to GND).
 *
 * A third topology handles resistor banks that terminate through distinct pins
 * on one shared multi-pin rail carrier (for example the SI7021 R1/R2 -> SJ1
 * jumper bank from issue #12).
 */

import type { ChipId, InputProblem, NetId, PinId } from "lib/types/InputProblem"
import type { Side } from "lib/types/Side"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"

const PASSIVE_PIN_COUNT = 2
const MAIN_CHIP_MIN_PINS = 4
const MIN_PASSIVE_GROUP_SIZE = 3
const MIN_COMMON_NODE_PASSIVE_GROUP_SIZE = 2
const MIN_RAIL_CARRIER_GROUP_SIZE = 2

export interface SameSidePassiveGroup {
  mainChipId: ChipId
  side: Side
  passiveChipIds: ChipId[]
  mainChipPinIds: PinId[]
}

const buildPinToChip = (problem: InputProblem): Record<PinId, ChipId> => {
  const pinToChip: Record<PinId, ChipId> = {}
  for (const [chipId, chip] of Object.entries(problem.chipMap)) {
    for (const pinId of chip.pins) pinToChip[pinId] = chipId
  }
  return pinToChip
}

const getStrongPinPairs = (problem: InputProblem): Array<[PinId, PinId]> => {
  const pairs: Array<[PinId, PinId]> = []
  const seen = new Set<string>()
  for (const [connKey, connected] of Object.entries(problem.pinStrongConnMap)) {
    if (!connected) continue
    const [a, b] = connKey.split("-") as [PinId, PinId]
    let key = `${a}|${b}`
    if (b < a) key = `${b}|${a}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push([a, b])
  }
  return pairs
}

const getNetForPin = (problem: InputProblem, pinId: PinId): NetId | null => {
  for (const [connKey, connected] of Object.entries(problem.netConnMap)) {
    if (!connected) continue
    if (!connKey.startsWith(`${pinId}-`)) continue
    return connKey.slice(pinId.length + 1)
  }
  return null
}

const getMainChipPinSide = (
  offset: { x: number; y: number },
  mainChipRotation: number,
): Side => {
  const o = rotatePinOffset(offset, mainChipRotation)
  if (Math.abs(o.x) >= Math.abs(o.y)) return o.x >= 0 ? "x+" : "x-"
  return o.y >= 0 ? "y+" : "y-"
}

const edgeCoordForSide = (
  offset: { x: number; y: number },
  side: Side,
): number => {
  if (side === "x-" || side === "x+") return offset.y
  return offset.x
}

export const findSameSidePassiveGroups = (
  problem: InputProblem,
): SameSidePassiveGroup[] => {
  const pinToChip = buildPinToChip(problem)
  const pairs = getStrongPinPairs(problem)
  const stronglyConnectedPinIds = new Set(pairs.flat())

  const strongByChip = new Map<
    ChipId,
    Array<{ selfPin: PinId; otherPin: PinId; otherChip: ChipId }>
  >()
  for (const [a, b] of pairs) {
    const chipA = pinToChip[a]
    const chipB = pinToChip[b]
    if (!chipA || !chipB || chipA === chipB) continue
    if (!strongByChip.has(chipA)) strongByChip.set(chipA, [])
    if (!strongByChip.has(chipB)) strongByChip.set(chipB, [])
    strongByChip.get(chipA)!.push({ selfPin: a, otherPin: b, otherChip: chipB })
    strongByChip.get(chipB)!.push({ selfPin: b, otherPin: a, otherChip: chipA })
  }

  const commonNodeGroups: SameSidePassiveGroup[] = []
  for (const strongs of strongByChip.values()) {
    const strongsByPin = new Map<PinId, typeof strongs>()
    for (const strong of strongs) {
      const fanout = strongsByPin.get(strong.selfPin) ?? []
      fanout.push(strong)
      strongsByPin.set(strong.selfPin, fanout)
    }
    for (const [commonPinId, fanout] of strongsByPin) {
      if (fanout.length < MIN_COMMON_NODE_PASSIVE_GROUP_SIZE) continue
      const commonNodePins = [commonPinId, ...fanout.map((s) => s.otherPin)]
      const candidatesByNet = new Map<NetId, ChipId[]>()
      for (const connectedPinId of commonNodePins) {
        const chipId = pinToChip[connectedPinId]
        const chip = problem.chipMap[chipId!]
        if (!chipId || chip?.fixedPosition || chip?.pins.length !== 2) continue
        const otherPinId = chip.pins.find((pinId) => pinId !== connectedPinId)
        if (!otherPinId || stronglyConnectedPinIds.has(otherPinId)) continue
        const netId = getNetForPin(problem, otherPinId)
        if (!netId) continue
        candidatesByNet.set(netId, [...(candidatesByNet.get(netId) ?? []), chipId])
      }
      for (const passiveChipIds of candidatesByNet.values()) {
        if (passiveChipIds.length < MIN_COMMON_NODE_PASSIVE_GROUP_SIZE) continue
        const anchorPins = commonNodePins.filter(
          (pinId) => !passiveChipIds.includes(pinToChip[pinId]!),
        )
        if (anchorPins.length !== 1) continue
        const mainChipPinId = anchorPins[0]!
        const mainChipId = pinToChip[mainChipPinId]
        if (!mainChipId) continue
        const mainChip = problem.chipMap[mainChipId]
        const mainChipPin = problem.chipPinMap[mainChipPinId]
        if (!mainChip || !mainChipPin) continue
        commonNodeGroups.push({
          mainChipId,
          side: getMainChipPinSide(
            mainChipPin.offset,
            mainChip.availableRotations?.[0] ?? 0,
          ),
          passiveChipIds,
          mainChipPinIds: passiveChipIds.map(() => mainChipPinId),
        })
      }
    }
  }

  const reservedPassiveChipIds = new Set(
    commonNodeGroups.flatMap((group) => group.passiveChipIds),
  )

  // Detect banks of typed resistors that connect one side of a main IC to
  // distinct pins on the same multi-pin carrier. This is the missing SI7021
  // shape: R1/R2 each have two strong edges, so the older one-edge detector
  // skipped them entirely.
  type RailCandidate = {
    passiveChipId: ChipId
    mainChipId: ChipId
    mainChipPinId: PinId
    carrierChipId: ChipId
    carrierPinId: PinId
    side: Side
    edgeCoord: number
  }
  const railCandidates: RailCandidate[] = []
  for (const [chipId, chip] of Object.entries(problem.chipMap)) {
    if (!chip.isResistor || chip.fixedPosition || chip.pins.length !== 2) continue
    const strongs = strongByChip.get(chipId) ?? []
    if (strongs.length !== 2) continue

    for (const mainStrong of strongs) {
      const mainChip = problem.chipMap[mainStrong.otherChip]
      if (!mainChip || mainChip.pins.length < MAIN_CHIP_MIN_PINS) continue
      const carrierStrong = strongs.find((s) => s !== mainStrong)
      if (!carrierStrong) continue
      const carrierChip = problem.chipMap[carrierStrong.otherChip]
      if (!carrierChip || carrierChip.fixedPosition) continue
      if (carrierChip.isResistor || carrierChip.isCapacitor || carrierChip.isCrystal) continue
      if (carrierChip.pins.length < 3) continue
      if (mainStrong.selfPin === carrierStrong.selfPin) continue

      const mainPin = problem.chipPinMap[mainStrong.otherPin]
      if (!mainPin) continue
      const rotation = mainChip.availableRotations?.[0] ?? 0
      const rotated = rotatePinOffset(mainPin.offset, rotation)
      const side = getMainChipPinSide(mainPin.offset, rotation)
      railCandidates.push({
        passiveChipId: chipId,
        mainChipId: mainStrong.otherChip,
        mainChipPinId: mainStrong.otherPin,
        carrierChipId: carrierStrong.otherChip,
        carrierPinId: carrierStrong.otherPin,
        side,
        edgeCoord: edgeCoordForSide(rotated, side),
      })
      break
    }
  }

  const railByGroup = new Map<string, RailCandidate[]>()
  for (const candidate of railCandidates) {
    const key = `${candidate.mainChipId}|${candidate.side}|${candidate.carrierChipId}`
    const list = railByGroup.get(key) ?? []
    list.push(candidate)
    railByGroup.set(key, list)
  }

  const railCarrierGroups: SameSidePassiveGroup[] = []
  for (const list of railByGroup.values()) {
    if (list.length < MIN_RAIL_CARRIER_GROUP_SIZE) continue
    if (new Set(list.map((c) => c.mainChipPinId)).size !== list.length) continue
    if (new Set(list.map((c) => c.carrierPinId)).size !== list.length) continue
    const carrier = problem.chipMap[list[0]!.carrierChipId]!
    const usedCarrierPins = new Set(list.map((c) => c.carrierPinId))
    const remainingCarrierPins = carrier.pins.filter((p) => !usedCarrierPins.has(p))
    if (remainingCarrierPins.length !== 1) continue
    if (!getNetForPin(problem, remainingCarrierPins[0]!)) continue
    list.sort((a, b) => a.edgeCoord - b.edgeCoord)
    const group = {
      mainChipId: list[0]!.mainChipId,
      side: list[0]!.side,
      passiveChipIds: list.map((c) => c.passiveChipId),
      mainChipPinIds: list.map((c) => c.mainChipPinId),
    }
    railCarrierGroups.push(group)
    for (const id of group.passiveChipIds) reservedPassiveChipIds.add(id)
  }

  interface Candidate {
    passiveChipId: ChipId
    mainChipId: ChipId
    mainChipPinId: PinId
    side: Side
    sharedNetId: NetId
    edgeCoord: number
  }
  const candidates: Candidate[] = []

  for (const [passiveChipId, passiveChip] of Object.entries(problem.chipMap)) {
    if (reservedPassiveChipIds.has(passiveChipId)) continue
    if (passiveChip.pins.length !== PASSIVE_PIN_COUNT) continue
    const strongs = strongByChip.get(passiveChipId) ?? []
    if (strongs.length !== 1) continue
    const { selfPin, otherPin: mainChipPinId, otherChip: mainChipId } = strongs[0]!
    const mainChip = problem.chipMap[mainChipId]
    if (!mainChip || mainChip.pins.length < MAIN_CHIP_MIN_PINS) continue
    const passiveOtherPinId = passiveChip.pins.find((p) => p !== selfPin)
    if (!passiveOtherPinId) continue
    const sharedNetId = getNetForPin(problem, passiveOtherPinId)
    if (!sharedNetId) continue
    const mainChipRotation = mainChip.availableRotations?.[0] ?? 0
    const mainChipPinOffset = rotatePinOffset(
      problem.chipPinMap[mainChipPinId]!.offset,
      mainChipRotation,
    )
    const side = getMainChipPinSide(
      problem.chipPinMap[mainChipPinId]!.offset,
      mainChipRotation,
    )
    candidates.push({
      passiveChipId,
      mainChipId,
      mainChipPinId,
      side,
      sharedNetId,
      edgeCoord: edgeCoordForSide(mainChipPinOffset, side),
    })
  }

  const candidatesByGroup = new Map<string, Candidate[]>()
  for (const candidate of candidates) {
    const key = `${candidate.mainChipId}|${candidate.side}|${candidate.sharedNetId}`
    const list = candidatesByGroup.get(key) ?? []
    list.push(candidate)
    candidatesByGroup.set(key, list)
  }

  const groups: SameSidePassiveGroup[] = [...commonNodeGroups, ...railCarrierGroups]
  for (const list of candidatesByGroup.values()) {
    if (list.length < MIN_PASSIVE_GROUP_SIZE) continue
    list.sort((a, b) => a.edgeCoord - b.edgeCoord)
    groups.push({
      mainChipId: list[0]!.mainChipId,
      side: list[0]!.side,
      passiveChipIds: list.map((c) => c.passiveChipId),
      mainChipPinIds: list.map((c) => c.mainChipPinId),
    })
  }
  return groups
}
