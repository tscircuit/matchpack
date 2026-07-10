/**
 * Identifies decoupling capacitor groups based on specific criteria:
 * 1. The component is a capacitor (chip.isCapacitor) — a diode or voltmeter can share
 *    a cap's geometry, so the component type is what qualifies it, not the pin count
 * 2. It has exactly 2 pins and restricted rotation (0/180 only or no rotation)
 * 3. One pin indirectly connected to a ground net, one to a positive voltage source
 * 4. It decouples a main chip, reached either by a direct pin-to-pin connection or by
 *    the positive rail it shares with that chip's power pins
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type {
  ChipId,
  InputProblem,
  NetId,
  PinId,
  Chip,
} from "lib/types/InputProblem"
import { getColorFromString } from "lib/utils/getColorFromString"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

export interface DecouplingCapGroup {
  decouplingCapGroupId: string
  mainChipId: ChipId
  netPair: [NetId, NetId]
  decouplingCapChipIds: ChipId[]
}

/**
 * Identify decoupling capacitor groups based on specific criteria:
 * 1. The component is a capacitor (chip.isCapacitor). Geometry alone is ambiguous —
 *    a 2-pin part bridging power and ground could be a TVS diode or a voltmeter — so
 *    the component type is what gates this, not the pin count.
 * 2. It has exactly 2 pins with restricted rotation (0/180 only or no rotation)
 * 3. One pin indirectly connected to a net with isGround and one to isPositiveVoltageSource
 * 4. It decouples a main chip (typically a microcontroller) — one reached by a direct
 *    pin-to-pin connection, or failing that the chip whose power pins share the cap's
 *    positive rail. See findMainChipIdForCap.
 */
export class IdentifyDecouplingCapsSolver extends BaseSolver {
  inputProblem: InputProblem

  queuedChips: Chip[]

  outputDecouplingCapGroups: DecouplingCapGroup[] = []

  /** Quick lookup of groups by main chip and net pair for accumulation */
  private groupsByMainChipId = new Map<string, DecouplingCapGroup>()

  constructor(inputProblem: InputProblem) {
    super()
    this.inputProblem = inputProblem
    this.queuedChips = Object.values(inputProblem.chipMap)
  }

  /** Determine if chip is a 2-pin component with restricted rotation */
  private isTwoPinRestrictedRotation(chip: Chip): boolean {
    if (chip.pins.length !== 2) return false

    // Must be restricted to 0/180 or a single fixed orientation
    if (!chip.availableRotations) return false
    const allowed = new Set<0 | 180>([0, 180])
    return (
      chip.availableRotations.length > 0 &&
      chip.availableRotations.every((r) => allowed.has(r as 0 | 180))
    )
  }

  /** Check that the two pins are on opposite Y sides (y+ and y-) */
  private pinsOnOppositeYSides(chip: Chip): boolean {
    if (chip.pins.length !== 2) return false
    const [p1, p2] = chip.pins
    const cp1 = this.inputProblem.chipPinMap[p1!]
    const cp2 = this.inputProblem.chipPinMap[p2!]
    if (!cp1 || !cp2) return false
    const sides = new Set([cp1.side, cp2.side])
    return sides.has("y+") && sides.has("y-")
  }

  /** Get chips strongly connected (direct pin-to-pin) to this pin */
  private getStronglyConnectedNeighborChips(pinId: PinId): Set<ChipId> {
    const neighbors = new Set<ChipId>()
    // TODO don't use string parsing
    for (const [connKey, connected] of Object.entries(
      this.inputProblem.pinStrongConnMap,
    )) {
      if (!connected) continue
      const [a, b] = connKey.split("-") as [PinId, PinId]
      if (a === pinId) {
        const otherChipId = b.split(".")[0]!
        neighbors.add(otherChipId)
      } else if (b === pinId) {
        const otherChipId = a.split(".")[0]!
        neighbors.add(otherChipId)
      }
    }
    return neighbors
  }

  /**
   * Find the chip a decoupling capacitor belongs to.
   *
   * What makes a cap belong to a chip is that it bridges that chip's power rail
   * and ground. A direct pin-to-pin connection is only one way the netlist can say
   * so — `U3.DVDD1: ["C18.1", "net.V1_1"]` names the pin, while a bulk cap on the
   * same rail (`C9.pin1: "net.V1_1"`) names only the net. Both decouple U3, so the
   * rail is consulted when there is no pin-to-pin edge to follow. Otherwise a cap's
   * grouping would depend on how its connection happened to be written.
   */
  private findMainChipIdForCap(
    capChip: Chip,
    netPair: [NetId, NetId],
  ): ChipId | null {
    return (
      this.findStronglyConnectedMainChipId(capChip) ??
      this.findRailSharingMainChipId(capChip, netPair)
    )
  }

  /** The chip sharing the most direct pin-to-pin connections with the cap. */
  private findStronglyConnectedMainChipId(capChip: Chip): ChipId | null {
    // Aggregate strong neighbors from both pins
    const strongConnectionCounts = new Map<ChipId, number>()
    for (const pinId of capChip.pins) {
      const neighborChipIds = this.getStronglyConnectedNeighborChips(pinId)
      for (const neighborChipId of neighborChipIds) {
        if (neighborChipId === capChip.chipId) continue
        const strongConnectionCount =
          strongConnectionCounts.get(neighborChipId) || 0
        strongConnectionCounts.set(neighborChipId, strongConnectionCount + 1)
      }
    }

    // Choose the neighbor with the most connections (tie-breaker: lexicographic)
    let mainChipId: ChipId | null = null
    let mainChipConnectionCount = 0
    for (const [chipId, strongConnectionCount] of strongConnectionCounts) {
      if (strongConnectionCount < mainChipConnectionCount) continue
      if (
        mainChipId !== null &&
        strongConnectionCount === mainChipConnectionCount &&
        chipId > mainChipId
      ) {
        continue
      }

      mainChipId = chipId
      mainChipConnectionCount = strongConnectionCount
    }
    return mainChipId
  }

  /** How many of a chip's pins sit on a net */
  private countChipPinsOnNet(chip: Chip, netId: NetId): number {
    let pinsOnNet = 0
    for (const pinId of chip.pins) {
      if (this.getNetIdsForPin(pinId).has(netId)) pinsOnNet++
    }
    return pinsOnNet
  }

  /**
   * The chip whose power pins sit on the cap's positive rail.
   *
   * Ground is not consulted because nearly every chip touches it. 2-pin parts on the
   * rail are skipped too: the thing being decoupled is a multi-pin chip, not another
   * cap (or diode) sharing the rail. If two chips share a rail (say two MCUs on V3_3),
   * the one drawing the most power pins from it is the one being decoupled.
   */
  private findRailSharingMainChipId(
    capChip: Chip,
    netPair: [NetId, NetId],
  ): ChipId | null {
    const powerNetId = netPair.find(
      (netId) => this.inputProblem.netMap[netId]?.isPositiveVoltageSource,
    )
    if (!powerNetId) return null

    // Choose the chip with the most power pins (tie-breaker: lexicographic)
    let mainChipId: ChipId | null = null
    let mainChipPowerPinCount = 0
    for (const [chipId, chip] of Object.entries(this.inputProblem.chipMap)) {
      if (chipId === capChip.chipId) continue
      if (chip.pins.length <= 2) continue

      const powerPinCount = this.countChipPinsOnNet(chip, powerNetId)
      if (powerPinCount === 0) continue
      if (powerPinCount < mainChipPowerPinCount) continue
      if (
        mainChipId !== null &&
        powerPinCount === mainChipPowerPinCount &&
        chipId > mainChipId
      ) {
        continue
      }

      mainChipId = chipId
      mainChipPowerPinCount = powerPinCount
    }
    return mainChipId
  }

  /** Get all net IDs connected to a pin */
  private getNetIdsForPin(pinId: PinId): Set<NetId> {
    const nets = new Set<NetId>()
    for (const [connKey, connected] of Object.entries(
      this.inputProblem.netConnMap,
    )) {
      if (!connected) continue
      const [p, n] = connKey.split("-") as [PinId, NetId]
      if (p === pinId) nets.add(n)
    }
    return nets
  }

  /** Get a normalized, sorted pair of net IDs connected across the two pins of a capacitor chip */
  private getNormalizedNetPair(capChip: Chip): [NetId, NetId] | null {
    if (capChip.pins.length !== 2) return null
    const nets = new Set<NetId>()
    for (const pinId of capChip.pins) {
      const pinNets = this.getNetIdsForPin(pinId)
      for (const n of pinNets) nets.add(n)
    }
    if (nets.size !== 2) return null
    const [a, b] = Array.from(nets).sort()
    return [a as NetId, b as NetId]
  }

  /** Adds a decoupling capacitor to the group for the given main chip and net pair */
  private addToGroup(
    mainChipId: ChipId,
    netPair: [NetId, NetId],
    capChipId: ChipId,
  ) {
    const [n1, n2] = netPair
    const groupKey = `${mainChipId}__${n1}__${n2}`
    let group = this.groupsByMainChipId.get(groupKey)
    if (!group) {
      group = {
        decouplingCapGroupId: `decap_group_${mainChipId}__${n1}__${n2}`,
        mainChipId,
        netPair: [n1, n2],
        decouplingCapChipIds: [],
      }
      this.groupsByMainChipId.set(groupKey, group)
      this.outputDecouplingCapGroups.push(group)
    }
    if (!group.decouplingCapChipIds.includes(capChipId)) {
      group.decouplingCapChipIds.push(capChipId)
    }
  }

  lastChip: Chip | null = null
  override _step() {
    const currentChip = this.queuedChips.shift()
    this.lastChip = currentChip ?? null
    if (!currentChip) {
      this.solved = true
      return
    }

    // Only a capacitor can be a decoupling cap. This is what separates it from a
    // diode, voltmeter, or any other 2-pin part bridging power and ground.
    if (!currentChip.isCapacitor) return

    // Apply identification criteria
    const isDecouplingCap =
      this.isTwoPinRestrictedRotation(currentChip) &&
      this.pinsOnOppositeYSides(currentChip)

    if (!isDecouplingCap) return

    // Require a well-defined pair of nets across the two pins
    const netPair = this.getNormalizedNetPair(currentChip)
    if (!netPair) return

    // Ensure the net pair corresponds to a true decoupling capacitor:
    // one net must be ground and the other a positive voltage source
    const [n1, n2] = netPair
    const net1 = this.inputProblem.netMap[n1]
    const net2 = this.inputProblem.netMap[n2]
    const isDecouplingNetPair =
      (net1?.isGround && net2?.isPositiveVoltageSource) ||
      (net2?.isGround && net1?.isPositiveVoltageSource)
    if (!isDecouplingNetPair) return

    // Require a chip for the cap to decouple, found by pin-to-pin connection or,
    // for a cap wired only to the rail, by the rail itself
    const mainChipId = this.findMainChipIdForCap(currentChip, netPair)
    if (!mainChipId) return

    this.addToGroup(mainChipId, netPair, currentChip.chipId)
  }

  override visualize(): GraphicsObject {
    const basicLayout = doBasicInputProblemLayout(this.inputProblem)
    const graphics: GraphicsObject = visualizeInputProblem(
      this.inputProblem,
      basicLayout,
    )

    // Colorize chips that are part of decoupling groups
    const chipDecapGroupMap = new Map<ChipId, DecouplingCapGroup>()
    for (const group of this.outputDecouplingCapGroups) {
      chipDecapGroupMap.set(group.mainChipId, group)
      for (const capChipId of group.decouplingCapChipIds) {
        chipDecapGroupMap.set(capChipId, group)
      }
    }

    for (const rect of graphics.rects || []) {
      if (rect.label !== this.lastChip?.chipId) {
        rect.fill = "rgba(0,0,0,0.5)"
      }
    }

    for (const rect of graphics.rects || []) {
      const chipId = (rect as any).label as ChipId
      const group = chipDecapGroupMap.get(chipId)
      if (!group) continue
      rect.label = `${rect.label}\n${group.decouplingCapGroupId}`
      rect.fill = getColorFromString(group.decouplingCapGroupId, 0.8)
    }

    return graphics
  }

  override getConstructorParams(): [InputProblem] {
    return [this.inputProblem]
  }

  computeProgress(): number {
    const total = Object.keys(this.inputProblem.chipMap).length || 1
    const processed = total - this.queuedChips.length
    return Math.min(1, Math.max(0, processed / total))
  }
}
