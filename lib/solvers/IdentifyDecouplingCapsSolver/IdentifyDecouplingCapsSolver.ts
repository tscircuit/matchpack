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

  /** Determine if chip is a 2-pin component */
  private isTwoPin(chip: Chip): boolean {
    return chip.pins.length === 2
  }

  /** Check that the two pins are on opposite sides (y+/y- or x+/x-) */
  private pinsOnOppositeSides(chip: Chip): boolean {
    if (chip.pins.length !== 2) return false
    const [p1, p2] = chip.pins
    const cp1 = this.inputProblem.chipPinMap[p1!]
    const cp2 = this.inputProblem.chipPinMap[p2!]
    if (!cp1 || !cp2) return false
    const sides = new Set([cp1.side, cp2.side])
    return (
      (sides.has("y+") && sides.has("y-")) ||
      (sides.has("x+") && sides.has("x-"))
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

  /** Find the main chip id for a decoupling capacitor candidate */
  private findMainChipIdForCap(capChip: Chip): ChipId | null {
    // Aggregate strong neighbors from both pins
    const strongNeighbors = new Map<ChipId, number>()
    for (const pinId of capChip.pins) {
      const neighbors = this.getStronglyConnectedNeighborChips(pinId)
      for (const n of neighbors) {
        strongNeighbors.set(n, (strongNeighbors.get(n) || 0) + 1)
      }
    }

    // Sort by count, then pick the most frequent neighbor that isn't the cap itself
    const sorted = Array.from(strongNeighbors.entries())
      .filter(([id]) => id !== capChip.chipId)
      .sort((a, b) => b[1] - a[1])

    return sorted[0]?.[0] || null
  }

  override _step() {
    const { inputProblem } = this

    // Identify all power/ground net pairs
    const gndNets = Object.values(inputProblem.netMap).filter((n) => n.isGround)
    const vccNets = Object.values(inputProblem.netMap).filter(
      (n) => n.isPositiveVoltageSource,
    )

    for (const gndNet of gndNets) {
      for (const vccNet of vccNets) {
        const gndNetId = gndNet.netId
        const vccNetId = vccNet.netId

        // 1) Find pins connected to this net
        const vccPins = Object.keys(inputProblem.netConnMap)
          .filter((k) => k.endsWith(`-${vccNetId}`))
          .map((k) => k.split("-")[0])
        const gndPins = Object.keys(inputProblem.netConnMap)
          .filter((k) => k.endsWith(`-${gndNetId}`))
          .map((k) => k.split("-")[0])

        const vccPinIdSet = new Set(vccPins)
        const gndPinIdSet = new Set(gndPins)

        // 2) Find chips with one pin on VCC and one on GND
        const candidateDecapChipIds: ChipId[] = []
        for (const chip of Object.values(inputProblem.chipMap)) {
          if (!this.isTwoPin(chip)) continue

          const [p1, p2] = chip.pins
          if (!p1 || !p2) continue

          const isDecap =
            (vccPinIdSet.has(p1) && gndPinIdSet.has(p2)) ||
            (vccPinIdSet.has(p2) && gndPinIdSet.has(p1))

          if (isDecap) {
            candidateDecapChipIds.push(chip.chipId)
          }
        }

        // 3) Group candidate decaps by their main chip
        for (const capChipId of candidateDecapChipIds) {
          const currentChip = inputProblem.chipMap[capChipId]!
          if (!this.pinsOnOppositeSides(currentChip)) continue

          const mainChipId = this.findMainChipIdForCap(currentChip)
          if (!mainChipId) continue

          const groupId = `decap_group_${mainChipId}__${gndNetId}__${vccNetId}`
          if (!this.groupsByMainChipId.has(groupId)) {
            this.groupsByMainChipId.set(groupId, {
              decouplingCapGroupId: groupId,
              mainChipId,
              netPair: [gndNetId, vccNetId],
              decouplingCapChipIds: [],
            })
          }
          this.groupsByMainChipId
            .get(groupId)!
            .decouplingCapChipIds.push(capChipId)
        }
      }
    }

    this.outputDecouplingCapGroups = Array.from(
      this.groupsByMainChipId.values(),
    )
    this.solved = true
  }

  override visualize(): GraphicsObject {
    const layout = doBasicInputProblemLayout(this.inputProblem)
    const graphics = visualizeInputProblem(this.inputProblem, layout)

    for (const group of this.outputDecouplingCapGroups) {
      const color = getColorFromString(group.decouplingCapGroupId)
      for (const chipId of group.decouplingCapChipIds) {
        graphics.addRect({
          center: layout.chipPlacements[chipId]!,
          size: this.inputProblem.chipMap[chipId]!.size,
          color,
          fill: true,
          opacity: 0.3,
          label: "decap",
        })
      }
    }

    return graphics
  }
}
