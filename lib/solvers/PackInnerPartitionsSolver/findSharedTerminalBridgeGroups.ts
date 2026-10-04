import type {
  Chip,
  ChipId,
  InputProblem,
  NetId,
  PinId,
} from "../../types/InputProblem"

const TWO_PIN_COMPONENT_PIN_COUNT = 2
const THREE_PIN_COMPONENT_PIN_COUNT = 3
const MIN_MAIN_CHIP_PIN_COUNT = 3

export type SeriesBranchComponent = {
  chipId: ChipId
  /** Pin facing the main chip. */
  nearPinId: PinId
  /** Pin facing the shared terminal bridge component. */
  farPinId: PinId
}

export type SharedTerminalBridgeGroup = {
  mainChipId: ChipId
  mainPinIds: [PinId, PinId]
  branches: [SeriesBranchComponent, SeriesBranchComponent]
  terminalChipId: ChipId
  /** [pin connected to branch 0 farPin, pin connected to branch 1 farPin] */
  terminalBranchPinIds: [PinId, PinId]
  terminalPowerPinId: PinId
}

export const isPositiveVoltageNet = (
  problem: InputProblem,
  netId: NetId,
): boolean => {
  const net = problem.netMap[netId]
  if (net?.isPositiveVoltageSource === true) return true
  if (net?.isGround === true) return false

  const name = netId.toUpperCase()
  if (
    name === "GND" ||
    name === "VSS" ||
    name === "0V" ||
    name.includes("GND")
  ) {
    return false
  }

  return (
    name.startsWith("V") ||
    name.startsWith("+") ||
    name.includes("3V") ||
    name.includes("5V") ||
    name === "PWR" ||
    name === "POWER"
  )
}

export const pinConnectsToPositiveVoltage = (
  problem: InputProblem,
  pinId: PinId,
): boolean => {
  for (const [connKey, connected] of Object.entries(problem.netConnMap)) {
    if (!connected) continue
    if (connKey.startsWith(`${pinId}-`)) {
      const netId = connKey.slice(pinId.length + 1)
      if (isPositiveVoltageNet(problem, netId)) return true
    }
  }

  for (const [connKey, connected] of Object.entries(problem.pinStrongConnMap)) {
    if (!connected) continue
    if (connKey.startsWith(`${pinId}-`)) {
      const target = connKey.slice(pinId.length + 1)
      if (isPositiveVoltageNet(problem, target)) return true
    }
    if (connKey.endsWith(`-${pinId}`)) {
      const target = connKey.slice(0, connKey.length - pinId.length - 1)
      if (isPositiveVoltageNet(problem, target)) return true
    }
  }

  return false
}

const arePinsDirectlyConnected = (
  problem: InputProblem,
  pinA: PinId,
  pinB: PinId,
): boolean => {
  if (
    problem.pinStrongConnMap[`${pinA}-${pinB}`] ||
    problem.pinStrongConnMap[`${pinB}-${pinA}`]
  ) {
    return true
  }

  // Check shared signal nets (excluding ground and positive voltage rails)
  for (const [connKeyA, connectedA] of Object.entries(problem.netConnMap)) {
    if (!connectedA || !connKeyA.startsWith(`${pinA}-`)) continue
    const netIdA = connKeyA.slice(pinA.length + 1)
    if (
      isPositiveVoltageNet(problem, netIdA) ||
      problem.netMap[netIdA]?.isGround
    ) {
      continue
    }

    if (problem.netConnMap[`${pinB}-${netIdA}`]) {
      return true
    }
  }

  return false
}

/**
 * Finds shared terminal bridge groups in an input problem.
 *
 * Pattern:
 * - A multi-pin main chip with two pins on the same side.
 * - Two 2-pin passives whose near pins connect to those two main-chip pins.
 * - A 3-pin bridge component whose two outer pins connect to the far pins of
 *   the passives, and whose third pin connects to a positive voltage supply rail.
 */
export const findSharedTerminalBridgeGroups = (
  inputProblem: InputProblem,
): SharedTerminalBridgeGroup[] => {
  const groups: SharedTerminalBridgeGroup[] = []
  const usedChips = new Set<ChipId>()

  const chips = Object.values(inputProblem.chipMap)

  // Find candidate 3-pin bridge components
  for (const termChip of chips) {
    if (
      termChip.pins.length !== THREE_PIN_COMPONENT_PIN_COUNT ||
      termChip.fixedPosition ||
      usedChips.has(termChip.chipId)
    ) {
      continue
    }

    // Find the positive voltage pin on the terminal chip
    const powerPins = termChip.pins.filter((pinId) =>
      pinConnectsToPositiveVoltage(inputProblem, pinId),
    )
    if (powerPins.length !== 1) continue
    const terminalPowerPinId = powerPins[0]!

    const branchPins = termChip.pins.filter(
      (pinId) => pinId !== terminalPowerPinId,
    ) as [PinId, PinId]
    if (branchPins.length !== 2) continue

    // Find candidate 2-pin passives connected to branchPins[0] and branchPins[1]
    const findBranchPassive = (
      termBranchPinId: PinId,
    ): SeriesBranchComponent | null => {
      for (const chip of chips) {
        if (
          chip.chipId === termChip.chipId ||
          chip.pins.length !== TWO_PIN_COMPONENT_PIN_COUNT ||
          chip.fixedPosition ||
          usedChips.has(chip.chipId)
        ) {
          continue
        }

        const [p1, p2] = chip.pins as [PinId, PinId]
        if (arePinsDirectlyConnected(inputProblem, termBranchPinId, p1)) {
          return { chipId: chip.chipId, farPinId: p1, nearPinId: p2 }
        }
        if (arePinsDirectlyConnected(inputProblem, termBranchPinId, p2)) {
          return { chipId: chip.chipId, farPinId: p2, nearPinId: p1 }
        }
      }
      return null
    }

    const branch0 = findBranchPassive(branchPins[0])
    const branch1 = findBranchPassive(branchPins[1])
    if (!branch0 || !branch1 || branch0.chipId === branch1.chipId) continue

    // Find the main chip connecting to near pins of both branches
    for (const mainChip of chips) {
      if (
        mainChip.pins.length < MIN_MAIN_CHIP_PIN_COUNT ||
        mainChip.chipId === termChip.chipId ||
        mainChip.chipId === branch0.chipId ||
        mainChip.chipId === branch1.chipId
      ) {
        continue
      }

      let mainPin0: PinId | null = null
      let mainPin1: PinId | null = null

      for (const pinId of mainChip.pins) {
        if (arePinsDirectlyConnected(inputProblem, branch0.nearPinId, pinId)) {
          mainPin0 = pinId
        }
        if (arePinsDirectlyConnected(inputProblem, branch1.nearPinId, pinId)) {
          mainPin1 = pinId
        }
      }

      if (!mainPin0 || !mainPin1 || mainPin0 === mainPin1) continue

      const pinObj0 = inputProblem.chipPinMap[mainPin0]
      const pinObj1 = inputProblem.chipPinMap[mainPin1]
      if (!pinObj0 || !pinObj1) continue

      // Verify that both pins are on the same side of the main chip
      if (pinObj0.side !== pinObj1.side) continue

      groups.push({
        mainChipId: mainChip.chipId,
        mainPinIds: [mainPin0, mainPin1],
        branches: [branch0, branch1],
        terminalChipId: termChip.chipId,
        terminalBranchPinIds: branchPins,
        terminalPowerPinId,
      })

      usedChips.add(termChip.chipId)
      usedChips.add(branch0.chipId)
      usedChips.add(branch1.chipId)
      break
    }
  }

  return groups
}

export const canLayoutSharedTerminalBridge = (
  partition: InputProblem,
): boolean => findSharedTerminalBridgeGroups(partition).length > 0
