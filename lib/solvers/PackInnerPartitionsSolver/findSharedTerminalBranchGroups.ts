import type { ChipId, InputProblem, PinId } from "../../types/InputProblem"

const BRANCH_PIN_COUNT = 2
const MIN_ANCHOR_PIN_COUNT = 3
const MIN_TERMINAL_PIN_COUNT = 3

export type SharedTerminalBranch = {
  chipId: ChipId
  mainPinId: PinId
  nearPinId: PinId
  farPinId: PinId
  terminalPinId: PinId
}

export type SharedTerminalBranchGroup = {
  mainChipId: ChipId
  terminalChipId: ChipId
  branches: [SharedTerminalBranch, SharedTerminalBranch]
}

type ChipConnection = {
  selfPinId: PinId
  otherPinId: PinId
  otherChipId: ChipId
}

const buildPinOwnerMap = (inputProblem: InputProblem): Map<PinId, ChipId> => {
  const pinOwnerMap = new Map<PinId, ChipId>()
  for (const chip of Object.values(inputProblem.chipMap)) {
    for (const pinId of chip.pins) pinOwnerMap.set(pinId, chip.chipId)
  }
  return pinOwnerMap
}

const buildConnectionsByChip = (
  inputProblem: InputProblem,
  pinOwnerMap: Map<PinId, ChipId>,
): Map<ChipId, ChipConnection[]> => {
  const result = new Map<ChipId, ChipConnection[]>()
  const seen = new Set<string>()

  for (const [connectionKey, connected] of Object.entries(
    inputProblem.pinStrongConnMap,
  )) {
    if (!connected) continue
    const [firstPinId, secondPinId] = connectionKey.split("-") as [PinId, PinId]
    const firstChipId = pinOwnerMap.get(firstPinId)
    const secondChipId = pinOwnerMap.get(secondPinId)
    if (!firstChipId || !secondChipId || firstChipId === secondChipId) continue

    const pairKey =
      firstPinId < secondPinId
        ? `${firstPinId}|${secondPinId}`
        : `${secondPinId}|${firstPinId}`
    if (seen.has(pairKey)) continue
    seen.add(pairKey)

    const firstConnections = result.get(firstChipId) ?? []
    firstConnections.push({
      selfPinId: firstPinId,
      otherPinId: secondPinId,
      otherChipId: secondChipId,
    })
    result.set(firstChipId, firstConnections)

    const secondConnections = result.get(secondChipId) ?? []
    secondConnections.push({
      selfPinId: secondPinId,
      otherPinId: firstPinId,
      otherChipId: firstChipId,
    })
    result.set(secondChipId, secondConnections)
  }

  return result
}

const pinHasNetConnection = (
  inputProblem: InputProblem,
  pinId: PinId,
): boolean =>
  Object.entries(inputProblem.netConnMap).some(
    ([connectionKey, connected]) =>
      connected && connectionKey.startsWith(`${pinId}-`),
  )

const edgeCoordinate = (inputProblem: InputProblem, pinId: PinId): number => {
  const pin = inputProblem.chipPinMap[pinId]
  if (!pin) return 0
  return pin.side === "x-" || pin.side === "x+" ? pin.offset.y : pin.offset.x
}

/**
 * Detect two movable two-pin branches that leave distinct pins on the same
 * side of a main chip and terminate on two distinct pins of one shared
 * multi-pin terminal. The terminal must not have any additional inter-chip
 * strong connections, and at least one remaining terminal pin must connect to
 * a net. This keeps the refinement narrow and topology-driven.
 */
export const findSharedTerminalBranchGroups = (
  inputProblem: InputProblem,
): SharedTerminalBranchGroup[] => {
  const pinOwnerMap = buildPinOwnerMap(inputProblem)
  const connectionsByChip = buildConnectionsByChip(inputProblem, pinOwnerMap)

  type Candidate = SharedTerminalBranch & {
    mainChipId: ChipId
    terminalChipId: ChipId
    mainPinSide: string
  }

  const candidates: Candidate[] = []

  for (const branchChip of Object.values(inputProblem.chipMap)) {
    if (
      branchChip.fixedPosition ||
      branchChip.pins.length !== BRANCH_PIN_COUNT
    ) {
      continue
    }

    const connections = connectionsByChip.get(branchChip.chipId) ?? []
    if (
      connections.length !== BRANCH_PIN_COUNT ||
      new Set(connections.map((connection) => connection.selfPinId)).size !==
        BRANCH_PIN_COUNT
    ) {
      continue
    }

    for (const [nearConnection, farConnection] of [
      [connections[0]!, connections[1]!],
      [connections[1]!, connections[0]!],
    ] as const) {
      const mainChip = inputProblem.chipMap[nearConnection.otherChipId]
      const terminalChip = inputProblem.chipMap[farConnection.otherChipId]
      const mainPin = inputProblem.chipPinMap[nearConnection.otherPinId]
      if (
        !mainChip ||
        !terminalChip ||
        !mainPin ||
        mainChip.chipId === terminalChip.chipId ||
        mainChip.pins.length < MIN_ANCHOR_PIN_COUNT ||
        terminalChip.pins.length < MIN_TERMINAL_PIN_COUNT ||
        terminalChip.fixedPosition
      ) {
        continue
      }

      candidates.push({
        chipId: branchChip.chipId,
        mainChipId: mainChip.chipId,
        terminalChipId: terminalChip.chipId,
        mainPinId: nearConnection.otherPinId,
        nearPinId: nearConnection.selfPinId,
        farPinId: farConnection.selfPinId,
        terminalPinId: farConnection.otherPinId,
        mainPinSide: mainPin.side,
      })
    }
  }

  const candidatesByGroup = new Map<string, Candidate[]>()
  for (const candidate of candidates) {
    const key = `${candidate.mainChipId}|${candidate.terminalChipId}|${candidate.mainPinSide}`
    const groupCandidates = candidatesByGroup.get(key) ?? []
    groupCandidates.push(candidate)
    candidatesByGroup.set(key, groupCandidates)
  }

  const groups: SharedTerminalBranchGroup[] = []
  const usedBranchChipIds = new Set<ChipId>()

  for (const groupCandidates of candidatesByGroup.values()) {
    if (groupCandidates.length !== 2) continue

    const [first, second] = groupCandidates
    if (
      !first ||
      !second ||
      first.chipId === second.chipId ||
      first.mainPinId === second.mainPinId ||
      first.terminalPinId === second.terminalPinId ||
      usedBranchChipIds.has(first.chipId) ||
      usedBranchChipIds.has(second.chipId)
    ) {
      continue
    }

    const terminalChip = inputProblem.chipMap[first.terminalChipId]
    const terminalConnections =
      connectionsByChip.get(first.terminalChipId) ?? []
    const branchChipIds = new Set([first.chipId, second.chipId])
    if (
      !terminalChip ||
      terminalConnections.length !== 2 ||
      terminalConnections.some(
        (connection) => !branchChipIds.has(connection.otherChipId),
      )
    ) {
      continue
    }

    const usedTerminalPins = new Set([
      first.terminalPinId,
      second.terminalPinId,
    ])
    const hasExternalNetPin = terminalChip.pins.some(
      (pinId) =>
        !usedTerminalPins.has(pinId) &&
        pinHasNetConnection(inputProblem, pinId),
    )
    if (!hasExternalNetPin) continue

    const ordered = [first, second].sort(
      (a, b) =>
        edgeCoordinate(inputProblem, a.mainPinId) -
        edgeCoordinate(inputProblem, b.mainPinId),
    ) as [Candidate, Candidate]

    groups.push({
      mainChipId: first.mainChipId,
      terminalChipId: first.terminalChipId,
      branches: [
        {
          chipId: ordered[0].chipId,
          mainPinId: ordered[0].mainPinId,
          nearPinId: ordered[0].nearPinId,
          farPinId: ordered[0].farPinId,
          terminalPinId: ordered[0].terminalPinId,
        },
        {
          chipId: ordered[1].chipId,
          mainPinId: ordered[1].mainPinId,
          nearPinId: ordered[1].nearPinId,
          farPinId: ordered[1].farPinId,
          terminalPinId: ordered[1].terminalPinId,
        },
      ],
    })
    usedBranchChipIds.add(first.chipId)
    usedBranchChipIds.add(second.chipId)
  }

  return groups
}
