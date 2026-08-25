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
 * This mirrors how IdentifyDecouplingCapsSolver groups decoupling caps around a
 * "main chip"; here passives are grouped by (main chip, side, shared net).
 *
 * calculate-packing places these one at a time with no concept of pin sides and
 * scatters them. PackInnerPartitionsSolver routes a partition that contains a
 * group to ParallelAlignedPassiveSolver, which keeps the rest of the packed
 * layout and re-flows just the group into a clean row.
 */

import type { ChipId, InputProblem, NetId, PinId } from "lib/types/InputProblem"
import type { Side } from "lib/types/Side"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"

const PASSIVE_PIN_COUNT = 2
const MAIN_CHIP_MIN_PINS = 4
const MIN_PASSIVE_GROUP_SIZE = 3
const MIN_COMMON_NODE_PASSIVE_GROUP_SIZE = 2

export interface SameSidePassiveGroup {
  mainChipId: ChipId
  side: Side
  /** Passive chips ordered by their main-chip pin coordinate along the edge. */
  passiveChipIds: ChipId[]
  /** Main-chip pin each passive connects to, parallel to `passiveChipIds`. */
  mainChipPinIds: PinId[]
  railCarrier?: {
    carrierChipId: ChipId
    passiveMainPinIds: PinId[]
    passiveCarrierPinIds: PinId[]
    carrierPinIds: PinId[]
  }
}

const buildPinToChip = (problem: InputProblem): Record<PinId, ChipId> => {
  const pinToChip: Record<PinId, ChipId> = {}
  for (const [chipId, chip] of Object.entries(problem.chipMap)) {
    for (const pinId of chip.pins) pinToChip[pinId] = chipId
  }
  return pinToChip
}

/** Deduplicated strong pin-to-pin connections. */
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

/** First net a pin connects to, if any. */
const getNetForPin = (problem: InputProblem, pinId: PinId): NetId | null => {
  for (const [connKey, connected] of Object.entries(problem.netConnMap)) {
    if (!connected) continue
    if (!connKey.startsWith(`${pinId}-`)) continue
    return connKey.slice(pinId.length + 1)
  }
  return null
}

const getNetIdsForPin = (problem: InputProblem, pinId: PinId): NetId[] => {
  const netIds: NetId[] = []
  for (const [connKey, connected] of Object.entries(problem.netConnMap)) {
    if (!connected) continue
    if (!connKey.startsWith(`${pinId}-`)) continue
    netIds.push(connKey.slice(pinId.length + 1))
  }
  return netIds
}

/** Main-chip side a pin offset points to once the chip's rotation is applied. */
const getMainChipPinSide = (
  offset: { x: number; y: number },
  mainChipRotation: number,
): Side => {
  const o = rotatePinOffset(offset, mainChipRotation)
  if (Math.abs(o.x) >= Math.abs(o.y)) {
    if (o.x >= 0) return "x+"
    return "x-"
  }
  if (o.y >= 0) return "y+"
  return "y-"
}

/** Coordinate along a chip edge (y for left/right sides, x for top/bottom). */
const edgeCoordForSide = (
  offset: { x: number; y: number },
  side: Side,
): number => {
  if (side === "x-" || side === "x+") return offset.y
  return offset.x
}

type StrongConnection = {
  selfPin: PinId
  otherPin: PinId
  otherChip: ChipId
}

interface RailCarrierCandidate {
  passiveChipId: ChipId
  passiveMainPinId: PinId
  passiveCarrierPinId: PinId
  carrierPinId: PinId
  mainChipPinId: PinId
  edgeCoord: number
  mainChipId: ChipId
  side: Side
  carrierChipId: ChipId
}

const hasDistinctValues = (values: string[]): boolean =>
  new Set(values).size === values.length

const sortRailCarrierCandidates = (
  candidates: RailCarrierCandidate[],
): void => {
  candidates.sort((a, b) => a.edgeCoord - b.edgeCoord)
}

/**
 * Find same-side passive groups in a partition. Returns one entry per group,
 * with its passives ordered along the main-chip edge.
 */
export const findSameSidePassiveGroups = (
  problem: InputProblem,
): SameSidePassiveGroup[] => {
  const pinToChip = buildPinToChip(problem)
  const pairs = getStrongPinPairs(problem)
  const stronglyConnectedPinIds = new Set(pairs.flat())

  // Strong connections per chip: which pin connects out, and to which chip.
  const strongByChip = new Map<ChipId, StrongConnection[]>()
  for (const [a, b] of pairs) {
    const chipA = pinToChip[a]
    const chipB = pinToChip[b]
    if (!chipA || !chipB || chipA === chipB) continue
    if (!strongByChip.has(chipA)) strongByChip.set(chipA, [])
    if (!strongByChip.has(chipB)) strongByChip.set(chipB, [])
    strongByChip.get(chipA)!.push({ selfPin: a, otherPin: b, otherChip: chipB })
    strongByChip.get(chipB)!.push({ selfPin: b, otherPin: a, otherChip: chipA })
  }

  const railCarrierGroups: SameSidePassiveGroup[] = []
  const railCarrierCandidatesByGroup = new Map<string, RailCarrierCandidate[]>()

  for (const [passiveChipId, passiveChip] of Object.entries(problem.chipMap)) {
    if (passiveChip.fixedPosition) continue
    if (passiveChip.pins.length !== PASSIVE_PIN_COUNT) continue
    if (passiveChip.isResistor !== true) continue

    const strongs = strongByChip.get(passiveChipId) ?? []
    if (strongs.length !== 2) continue
    const mainStrong = strongs.find((strong) => {
      const chip = problem.chipMap[strong.otherChip]
      return (
        chip && !chip.fixedPosition && chip.pins.length >= MAIN_CHIP_MIN_PINS
      )
    })
    const carrierStrong = strongs.find((strong) => {
      const chip = problem.chipMap[strong.otherChip]
      return chip && !chip.fixedPosition && chip.pins.length === 3
    })
    if (!mainStrong || !carrierStrong) continue
    if (mainStrong.selfPin === carrierStrong.selfPin) continue
    if (mainStrong.otherChip === carrierStrong.otherChip) continue

    const mainPin = problem.chipPinMap[mainStrong.otherPin]
    const mainChip = problem.chipMap[mainStrong.otherChip]!
    if (!mainPin) continue
    const mainChipRotation = mainChip.availableRotations?.[0] ?? 0
    const mainChipPinOffset = rotatePinOffset(mainPin.offset, mainChipRotation)
    const side = getMainChipPinSide(mainPin.offset, mainChipRotation)
    const key = `${mainStrong.otherChip}|${side}|${carrierStrong.otherChip}`
    railCarrierCandidatesByGroup.set(key, [
      ...(railCarrierCandidatesByGroup.get(key) ?? []),
      {
        passiveChipId,
        passiveMainPinId: mainStrong.selfPin,
        passiveCarrierPinId: carrierStrong.selfPin,
        carrierPinId: carrierStrong.otherPin,
        mainChipPinId: mainStrong.otherPin,
        edgeCoord: edgeCoordForSide(mainChipPinOffset, side),
        mainChipId: mainStrong.otherChip,
        side,
        carrierChipId: carrierStrong.otherChip,
      },
    ])
  }

  for (const candidates of railCarrierCandidatesByGroup.values()) {
    const first = candidates[0]
    if (!first || candidates.length !== 2) continue
    const carrierChip = problem.chipMap[first.carrierChipId]
    if (!carrierChip || carrierChip.pins.length !== 3) continue

    const passiveChipIds = candidates.map(
      (candidate) => candidate.passiveChipId,
    )
    const mainChipPinIds = candidates.map(
      (candidate) => candidate.mainChipPinId,
    )
    const carrierPinIds = candidates.map((candidate) => candidate.carrierPinId)
    if (
      !hasDistinctValues(passiveChipIds) ||
      !hasDistinctValues(mainChipPinIds) ||
      !hasDistinctValues(carrierPinIds) ||
      !hasDistinctValues(
        candidates.map((candidate) => `${candidate.edgeCoord}`),
      )
    ) {
      continue
    }

    const claimedCarrierPins = new Set(carrierPinIds)
    const carrierPinsAreExclusive = carrierPinIds.every((carrierPinId) => {
      const strongsForPin = (
        strongByChip.get(first.carrierChipId) ?? []
      ).filter((strong) => strong.selfPin === carrierPinId)
      return (
        strongsForPin.length === 1 &&
        passiveChipIds.includes(strongsForPin[0]!.otherChip)
      )
    })
    const railPins = carrierChip.pins.filter(
      (pinId) =>
        !claimedCarrierPins.has(pinId) &&
        (strongByChip.get(first.carrierChipId) ?? []).every(
          (strong) => strong.selfPin !== pinId,
        ) &&
        getNetIdsForPin(problem, pinId).length === 1,
    )
    if (!carrierPinsAreExclusive || railPins.length !== 1) continue

    sortRailCarrierCandidates(candidates)
    railCarrierGroups.push({
      mainChipId: first.mainChipId,
      side: first.side,
      passiveChipIds: candidates.map((candidate) => candidate.passiveChipId),
      mainChipPinIds: candidates.map((candidate) => candidate.mainChipPinId),
      railCarrier: {
        carrierChipId: first.carrierChipId,
        passiveMainPinIds: candidates.map(
          (candidate) => candidate.passiveMainPinId,
        ),
        passiveCarrierPinIds: candidates.map(
          (candidate) => candidate.passiveCarrierPinId,
        ),
        carrierPinIds,
      },
    })
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
        candidatesByNet.set(netId, [
          ...(candidatesByNet.get(netId) ?? []),
          chipId,
        ])
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
  const commonNodePassiveChipIds = new Set(
    commonNodeGroups.flatMap((group) => group.passiveChipIds),
  )
  const railCarrierPassiveChipIds = new Set(
    railCarrierGroups.flatMap((group) => group.passiveChipIds),
  )

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
    if (railCarrierPassiveChipIds.has(passiveChipId)) continue
    if (commonNodePassiveChipIds.has(passiveChipId)) continue
    if (passiveChip.pins.length !== PASSIVE_PIN_COUNT) continue

    // Exactly one direct connection, which must be to the main chip.
    const strongs = strongByChip.get(passiveChipId) ?? []
    if (strongs.length !== 1) continue

    const {
      selfPin,
      otherPin: mainChipPinId,
      otherChip: mainChipId,
    } = strongs[0]!
    const mainChip = problem.chipMap[mainChipId]
    if (!mainChip || mainChip.pins.length < MAIN_CHIP_MIN_PINS) continue

    // The passive's other pin must sit on a net the group can share.
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

  // Group candidates that share a main chip, side, and net, then keep the ones
  // big enough to be worth laying out as a row.
  const candidatesByGroup = new Map<string, Candidate[]>()
  for (const candidate of candidates) {
    const key = `${candidate.mainChipId}|${candidate.side}|${candidate.sharedNetId}`
    const list = candidatesByGroup.get(key) ?? []
    list.push(candidate)
    candidatesByGroup.set(key, list)
  }

  const groups: SameSidePassiveGroup[] = [
    ...railCarrierGroups,
    ...commonNodeGroups,
  ]
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
