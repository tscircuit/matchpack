/**
 * Detects "same-side passive groups": three or more 2-pin passives that each
 * connect *directly* (one strong pin-to-pin link) to the same side of the same
 * chip and share a common net on their other pin (e.g. the BQ24074's R1/R2/R3 on
 * U1's bottom edge with their other pin on GND, or on U1's right edge via
 * EN2/EN1/TMR).
 *
 * This mirrors how IdentifyDecouplingCapsSolver groups decoupling caps around a
 * "main chip"; here passives are grouped by (main chip, side, shared net).
 *
 * calculate-packing places these one at a time with no concept of pin sides and
 * scatters them. PackInnerPartitionsSolver routes a partition that contains a
 * group to ChipPassivesLayoutSolver, which keeps the rest of the packed layout
 * and re-flows just the group into a clean row.
 */

import type { ChipId, InputProblem, NetId, PinId } from "lib/types/InputProblem"
import type { Side } from "lib/types/Side"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"

const PASSIVE_PIN_COUNT = 2
const MAIN_CHIP_MIN_PINS = 4
const MIN_PASSIVE_GROUP_SIZE = 3

export interface SameSidePassiveGroup {
  mainChipId: ChipId
  side: Side
  /** Passive chips ordered by their main-chip pin coordinate along the edge. */
  passiveChipIds: ChipId[]
  /** Main-chip pin each passive connects to, parallel to `passiveChipIds`. */
  mainChipPinIds: PinId[]
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

/**
 * Find same-side passive groups in a partition. Returns one entry per group,
 * with its passives ordered along the main-chip edge.
 */
export const findSameSidePassiveGroups = (
  problem: InputProblem,
): SameSidePassiveGroup[] => {
  const pinToChip = buildPinToChip(problem)
  const pairs = getStrongPinPairs(problem)

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

  const groups: SameSidePassiveGroup[] = []
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
