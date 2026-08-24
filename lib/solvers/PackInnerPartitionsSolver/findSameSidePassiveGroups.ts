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

import type {
  Chip,
  ChipId,
  InputProblem,
  NetId,
  PinId,
} from "lib/types/InputProblem"
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
    railPinId: PinId
    passiveMainPinIdsByChipId: Record<ChipId, PinId>
    passiveCarrierPinIdsByChipId: Record<ChipId, PinId>
    carrierPinIdsByPassiveChipId: Record<ChipId, PinId>
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

const isRailCarrierPassiveLeaf = (chip: Chip): boolean =>
  chip.pins.length === PASSIVE_PIN_COUNT && chip.isResistor === true

const passiveSetKey = (passiveChipIds: ChipId[]): string =>
  [...passiveChipIds].sort().join("|")

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

  const railCarrierGroups: SameSidePassiveGroup[] = []
  interface RailCarrierCandidate {
    passiveChipId: ChipId
    passiveMainPinId: PinId
    passiveCarrierPinId: PinId
    carrierPinId: PinId
    mainChipPinId: PinId
    edgeCoord: number
  }
  const railCarrierCandidatesByGroup = new Map<
    string,
    Array<
      RailCarrierCandidate & {
        mainChipId: ChipId
        side: Side
        carrierChipId: ChipId
      }
    >
  >()

  for (const [passiveChipId, passiveChip] of Object.entries(problem.chipMap)) {
    if (passiveChip.fixedPosition) continue
    if (!isRailCarrierPassiveLeaf(passiveChip)) continue

    const strongs = strongByChip.get(passiveChipId) ?? []
    for (const strongToMain of strongs) {
      const mainChipId = strongToMain.otherChip
      const mainChip = problem.chipMap[mainChipId]
      const mainPin = problem.chipPinMap[strongToMain.otherPin]
      if (!mainChip || !mainPin) continue
      if (mainChip.fixedPosition) continue
      if (mainChip.pins.length < MAIN_CHIP_MIN_PINS) continue

      const passiveCarrierPinId = passiveChip.pins.find(
        (pinId) => pinId !== strongToMain.selfPin,
      )
      if (!passiveCarrierPinId) continue

      const carrierStrongConnections = strongs.filter(
        (strong) => strong.selfPin === passiveCarrierPinId,
      )
      if (carrierStrongConnections.length !== 1) continue

      const carrierConnection = carrierStrongConnections[0]!
      const carrierChipId = carrierConnection.otherChip
      if (carrierChipId === mainChipId) continue
      const carrierChip = problem.chipMap[carrierChipId]
      if (!carrierChip || carrierChip.fixedPosition) continue
      if (carrierChip.pins.length < MIN_COMMON_NODE_PASSIVE_GROUP_SIZE + 1)
        continue

      const mainChipRotation = mainChip.availableRotations?.[0] ?? 0
      const mainChipPinOffset = rotatePinOffset(
        mainPin.offset,
        mainChipRotation,
      )
      const side = getMainChipPinSide(mainPin.offset, mainChipRotation)
      const key = `${mainChipId}|${side}|${carrierChipId}`
      const candidates = railCarrierCandidatesByGroup.get(key) ?? []
      candidates.push({
        passiveChipId,
        passiveMainPinId: strongToMain.selfPin,
        passiveCarrierPinId,
        carrierPinId: carrierConnection.otherPin,
        mainChipPinId: strongToMain.otherPin,
        edgeCoord: edgeCoordForSide(mainChipPinOffset, side),
        mainChipId,
        side,
        carrierChipId,
      })
      railCarrierCandidatesByGroup.set(key, candidates)
    }
  }

  for (const candidates of railCarrierCandidatesByGroup.values()) {
    if (candidates.length < MIN_COMMON_NODE_PASSIVE_GROUP_SIZE) continue
    const firstCandidate = candidates[0]
    if (!firstCandidate) continue
    const { mainChipId, side, carrierChipId } = firstCandidate
    const carrierChip = problem.chipMap[carrierChipId]!
    const passiveChipIds = candidates.map(
      (candidate) => candidate.passiveChipId,
    )
    if (new Set(passiveChipIds).size !== passiveChipIds.length) continue
    const carrierPinIds = candidates.map((candidate) => candidate.carrierPinId)
    if (new Set(carrierPinIds).size !== carrierPinIds.length) continue

    const claimedCarrierPins = new Set(carrierPinIds)
    let hasAmbiguousCarrierBranch = false
    for (const carrierPinId of carrierChip.pins) {
      const carrierPinStrongConnections = (
        strongByChip.get(carrierChipId) ?? []
      ).filter((strong) => strong.selfPin === carrierPinId)
      if (claimedCarrierPins.has(carrierPinId)) {
        const matchingPassiveConnections = carrierPinStrongConnections.filter(
          (strong) => passiveChipIds.includes(strong.otherChip),
        )
        if (
          matchingPassiveConnections.length !== 1 ||
          carrierPinStrongConnections.length !== 1
        ) {
          hasAmbiguousCarrierBranch = true
          break
        }
        continue
      }
      if (carrierPinStrongConnections.length > 0) {
        hasAmbiguousCarrierBranch = true
        break
      }
    }
    if (hasAmbiguousCarrierBranch) continue

    const railPins = carrierChip.pins.filter(
      (pinId) =>
        !claimedCarrierPins.has(pinId) &&
        getNetIdsForPin(problem, pinId).length === 1,
    )
    if (railPins.length !== 1) continue
    const accountedCarrierPins = new Set([...carrierPinIds, railPins[0]!])
    if (carrierChip.pins.some((pinId) => !accountedCarrierPins.has(pinId))) {
      continue
    }

    candidates.sort((a, b) => a.edgeCoord - b.edgeCoord)
    railCarrierGroups.push({
      mainChipId,
      side,
      passiveChipIds: candidates.map((candidate) => candidate.passiveChipId),
      mainChipPinIds: candidates.map((candidate) => candidate.mainChipPinId),
      railCarrier: {
        carrierChipId,
        railPinId: railPins[0]!,
        passiveMainPinIdsByChipId: Object.fromEntries(
          candidates.map((candidate) => [
            candidate.passiveChipId,
            candidate.passiveMainPinId,
          ]),
        ),
        passiveCarrierPinIdsByChipId: Object.fromEntries(
          candidates.map((candidate) => [
            candidate.passiveChipId,
            candidate.passiveCarrierPinId,
          ]),
        ),
        carrierPinIdsByPassiveChipId: Object.fromEntries(
          candidates.map((candidate) => [
            candidate.passiveChipId,
            candidate.carrierPinId,
          ]),
        ),
      },
    })
  }

  const ambiguousRailCarrierGroupKeys = new Set<string>()
  for (let i = 0; i < railCarrierGroups.length; i++) {
    const group = railCarrierGroups[i]!
    if (!group.railCarrier) continue
    const groupPassiveKey = passiveSetKey(group.passiveChipIds)
    for (let j = i + 1; j < railCarrierGroups.length; j++) {
      const otherGroup = railCarrierGroups[j]!
      const otherRailCarrier = otherGroup.railCarrier
      if (!otherRailCarrier) continue
      if (
        group.mainChipId === otherRailCarrier.carrierChipId &&
        group.railCarrier.carrierChipId === otherGroup.mainChipId &&
        groupPassiveKey === passiveSetKey(otherGroup.passiveChipIds)
      ) {
        ambiguousRailCarrierGroupKeys.add(
          `${group.mainChipId}|${group.railCarrier.carrierChipId}|${groupPassiveKey}`,
        )
        ambiguousRailCarrierGroupKeys.add(
          `${otherGroup.mainChipId}|${otherRailCarrier.carrierChipId}|${groupPassiveKey}`,
        )
      }
    }
  }
  const unambiguousRailCarrierGroups = railCarrierGroups.filter((group) => {
    const railCarrier = group.railCarrier
    if (!railCarrier) return true
    return !ambiguousRailCarrierGroupKeys.has(
      `${group.mainChipId}|${railCarrier.carrierChipId}|${passiveSetKey(group.passiveChipIds)}`,
    )
  })

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
    unambiguousRailCarrierGroups.flatMap((group) => group.passiveChipIds),
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
    ...unambiguousRailCarrierGroups,
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
