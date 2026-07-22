/**
 * Identifies decoupling capacitor groups based on specific criteria:
 * 1. The component is a capacitor (chip.isCapacitor) — a diode or voltmeter can share
 *    a cap's geometry, so the component type is what qualifies it, not the pin count
 * 2. It has exactly 2 pins and a restricted or single fixed rotation
 * 3. One pin indirectly connected to a ground net, one to a positive voltage source
 * 4. It decouples a main chip: one it is directly (pin-to-pin) wired to, or — for a
 *    cap wired only to the rail — the chip whose directly-wired caps already decouple
 *    that same rail (see findRailSharingMainChipId)
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
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
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
 * 2. It has exactly 2 pins with a restricted or single fixed rotation
 * 3. One pin indirectly connected to a net with isGround and one to isPositiveVoltageSource
 * 4. It decouples a main chip (typically a microcontroller) — one it is directly
 *    (pin-to-pin) wired to, or — for a cap wired only to the rail — the chip whose
 *    directly-wired caps already decouple that rail. See findRailSharingMainChipId.
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

    // Must be restricted to 0/180 or a single fixed orientation.
    if (!chip.availableRotations) return false
    const allowed = new Set<0 | 180>([0, 180])
    return (
      chip.availableRotations.length > 0 &&
      (chip.availableRotations.length === 1 ||
        chip.availableRotations.every((r) => allowed.has(r as 0 | 180)))
    )
  }

  /** Check that the two pins run vertically after the fixed rotation. */
  private pinsOnOppositeYSidesAfterRotation(chip: Chip): boolean {
    if (chip.pins.length !== 2) return false
    const [p1, p2] = chip.pins
    const cp1 = this.inputProblem.chipPinMap[p1!]
    const cp2 = this.inputProblem.chipPinMap[p2!]
    if (!cp1 || !cp2) return false

    const rotation = chip.availableRotations?.[0] ?? 0
    const offset1 = rotatePinOffset(cp1.offset, rotation)
    const offset2 = rotatePinOffset(cp2.offset, rotation)
    const verticalSeparation = Math.abs(offset1.y - offset2.y)
    return (
      verticalSeparation > 0 &&
      verticalSeparation >= Math.abs(offset1.x - offset2.x)
    )
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
   * Find the chip a decoupling capacitor decouples.
   *
   * A cap directly wired (pin-to-pin) to a chip decouples that chip. A cap wired
   * only to the rail's nets — e.g. a bulk cap `C9.pin1: "net.V1_1"` — has no such
   * edge, so it decouples whichever chip the rail's *directly-wired* caps already
   * decouple. See findRailSharingMainChipId.
   */
  private findMainChipIdForCap(
    capChip: Chip,
    netPair: [NetId, NetId],
  ): ChipId | null {
    return (
      this.findStronglyConnectedMainChipId(capChip) ??
      this.findRailSharingMainChipId(capChip, netPair) ??
      this.findUniqueMainChipSharingNetPair(netPair)
    )
  }

  /** Use a rail-only fallback only when one non-capacitor chip shares both rails. */
  private findUniqueMainChipSharingNetPair(
    netPair: [NetId, NetId],
  ): ChipId | null {
    const candidates = Object.values(this.inputProblem.chipMap).filter(
      (chip) =>
        !chip.isCapacitor &&
        netPair.every((netId) =>
          chip.pins.some((pinId) => this.getNetIdsForPin(pinId).has(netId)),
        ),
    )

    return candidates.length === 1 ? candidates[0]!.chipId : null
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

  /**
   * The chip a rail-only cap (no pin-to-pin edge) decouples: the same chip that a
   * directly-wired sibling cap on the same rail decouples.
   *
   * C9 is wired only to V1_1/GND, but C18/C7 sit on that same rail and are wired
   * straight to U3.DVDD, so C9 decouples U3 too. Without such a sibling — a lone cap
   * on, say, a pin header's power rail — no chip is being decoupled there, so the cap
   * is left ungrouped rather than attached to whatever multi-pin part touches the net.
   */
  private findRailSharingMainChipId(
    capChip: Chip,
    netPair: [NetId, NetId],
  ): ChipId | null {
    for (const sibling of Object.values(this.inputProblem.chipMap)) {
      if (sibling.chipId === capChip.chipId) continue
      if (!sibling.isCapacitor) continue

      const siblingPair = this.getNormalizedNetPair(sibling)
      if (
        !siblingPair ||
        siblingPair[0] !== netPair[0] ||
        siblingPair[1] !== netPair[1]
      ) {
        continue
      }

      const mainChipId = this.findStronglyConnectedMainChipId(sibling)
      if (mainChipId) return mainChipId
    }
    return null
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
      this.pinsOnOppositeYSidesAfterRotation(currentChip)

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
    // for a cap wired only to the rail, the chip whose directly-wired caps already
    // decouple that rail
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
