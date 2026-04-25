/**
 * Identifies decoupling capacitor groups based on specific criteria:
 * 1. Component has exactly 2 pins and restricted rotation (0/180 only or no rotation)
 * 2. One pin indirectly connected to net with "y+" restriction, one to "y-" restriction
 * 3. At least one pin directly connected to another chip
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
 * 1. Component has exactly 2 pins and restricted rotation (0/180 only or no rotation)
 * 2. One pin indirectly connected to net with isGround and one to isPositiveVoltageSource
 * 3. At least one pin directly connected to a chip (the main chip, typically a microcontroller)
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

  /** Determine if chip is a 2-pin component with restricted rotation.
   *
   * A decoupling capacitor is typically a 0402/0603 passive that either:
   *  - has an explicitly restricted rotation set (e.g. [0, 180] or [0])
   *  - has all four rotations but its pins are on the y+/y- sides (the
   *    component is physically a 2-pin passive oriented vertically)
   *
   * We accept [0], [180], [0, 180] as well as [90, 270] (horizontal) – any
   * subset that excludes the "diagonal" orientations.  We also accept a chip
   * with all 4 rotations when its pins are on opposite Y sides, because the
   * converter doesn't always restrict passives to [0,180].
   */
  private isTwoPinRestrictedRotation(chip: Chip): boolean {
    if (chip.pins.length !== 2) return false

    // If no rotation info, can't determine – skip
    if (!chip.availableRotations) return false

    const rotSet = new Set(chip.availableRotations)
    // Purely horizontal/vertical subsets: subset of {0,180} or {90,270}
    const onlyCardinal =
      rotSet.size > 0 &&
      [...rotSet].every((r) => r === 0 || r === 180 || r === 90 || r === 270)

    if (!onlyCardinal) return false

    // Prefer components restricted to fewer rotations (indicates passive)
    if (rotSet.size <= 2) return true

    // All 4 rotations – only accept if pins are on y+/y- or x+/x- sides
    if (rotSet.size === 4) {
      return this.pinsOnOppositeYSides(chip) || this.pinsOnOppositeXSides(chip)
    }

    return true
  }

  /** Check that the two pins are on opposite X sides (x+ and x-) */
  private pinsOnOppositeXSides(chip: Chip): boolean {
    if (chip.pins.length !== 2) return false
    const [p1, p2] = chip.pins
    const cp1 = this.inputProblem.chipPinMap[p1!]
    const cp2 = this.inputProblem.chipPinMap[p2!]
    if (!cp1 || !cp2) return false
    const sides = new Set([cp1.side, cp2.side])
    return sides.has("x+") && sides.has("x-")
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

  /** Find the main chip id for a decoupling capacitor candidate.
   *
   * Primary strategy: find chips that are directly strong-connected to one of
   * the cap's pins.
   *
   * Fallback: if no direct strong connection exists, find the chip that has
   * the most pins on the cap's supply net(s) — this handles topology where
   * the cap is only connected via the net, not via a direct wire.
   */
  private findMainChipIdForCap(capChip: Chip): ChipId | null {
    // Primary: strong neighbours
    const strongNeighbors = new Map<ChipId, number>()
    for (const pinId of capChip.pins) {
      const neighbors = this.getStronglyConnectedNeighborChips(pinId)
      for (const n of neighbors) {
        if (n === capChip.chipId) continue
        strongNeighbors.set(n, (strongNeighbors.get(n) || 0) + 1)
      }
    }

    if (strongNeighbors.size > 0) {
      let best: { id: ChipId; score: number } | null = null
      for (const [id, score] of strongNeighbors.entries()) {
        if (
          !best ||
          score > best.score ||
          (score === best.score && id < best.id)
        )
          best = { id, score }
      }
      return best ? best.id : null
    }

    // Fallback: find chip with the most pins on the same supply nets
    const netPair = this.getNormalizedNetPair(capChip)
    if (!netPair) return null

    const netPairSet = new Set(netPair)
    const chipScores = new Map<ChipId, number>()

    for (const [connKey, connected] of Object.entries(
      this.inputProblem.netConnMap,
    )) {
      if (!connected) continue
      const [pinId, netId] = connKey.split("-") as [PinId, NetId]
      if (!netPairSet.has(netId)) continue
      const chipId = pinId.split(".")[0]
      if (!chipId || chipId === capChip.chipId) continue
      chipScores.set(chipId, (chipScores.get(chipId) || 0) + 1)
    }

    if (chipScores.size === 0) return null

    let best: { id: ChipId; score: number } | null = null
    for (const [id, score] of chipScores.entries()) {
      if (!best || score > best.score || (score === best.score && id < best.id))
        best = { id, score }
    }
    return best ? best.id : null
  }

  /** Get all net IDs connected to a pin.
   *
   * Also walks one hop via pinStrongConnMap: if this pin is directly wired
   * to another chip's pin that has a net assignment, the cap inherits that
   * net.  This is the common RP2040 topology where a VCC capacitor pin is
   * strong-connected to the RP2040 VCC pin but has no direct netConnMap
   * entry of its own.
   */
  private getNetIdsForPin(pinId: PinId): Set<NetId> {
    const nets = new Set<NetId>()
    for (const [connKey, connected] of Object.entries(
      this.inputProblem.netConnMap,
    )) {
      if (!connected) continue
      const [p, n] = connKey.split("-") as [PinId, NetId]
      if (p === pinId) nets.add(n)
    }

    // One-hop via strong connections
    const strongNeighbors = this.getStronglyConnectedNeighborPins(pinId)
    for (const neighborPin of strongNeighbors) {
      for (const [connKey, connected] of Object.entries(
        this.inputProblem.netConnMap,
      )) {
        if (!connected) continue
        const [p, n] = connKey.split("-") as [PinId, NetId]
        if (p === neighborPin) nets.add(n)
      }
    }

    return nets
  }

  /** Get all pins strongly connected to the given pin (excluding the pin itself) */
  private getStronglyConnectedNeighborPins(pinId: PinId): Set<PinId> {
    const neighbors = new Set<PinId>()
    for (const [connKey, connected] of Object.entries(
      this.inputProblem.pinStrongConnMap,
    )) {
      if (!connected) continue
      const [a, b] = connKey.split("-") as [PinId, PinId]
      if (a === pinId) neighbors.add(b)
      else if (b === pinId) neighbors.add(a)
    }
    return neighbors
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

    // Apply identification criteria
    const isDecouplingCap =
      this.isTwoPinRestrictedRotation(currentChip) &&
      this.pinsOnOppositeYSides(currentChip)

    if (!isDecouplingCap) return

    // Require at least one strong connection to another chip (main chip)
    const mainChipId = this.findMainChipIdForCap(currentChip)
    if (!mainChipId) return

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
