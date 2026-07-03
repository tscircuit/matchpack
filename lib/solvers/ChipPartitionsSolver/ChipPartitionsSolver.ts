/**
 * Creates partitions (small subset groups) surrounding complex chips.
 * Divides the layout problem into manageable sections for more efficient processing.
 */

import { BaseSolver } from "../BaseSolver"
import type {
  InputProblem,
  ChipId,
  PinId,
  NetId,
  PartitionInputProblem,
  Chip,
} from "lib/types/InputProblem"
import type { GraphicsObject } from "graphics-debug"
import { stackGraphicsHorizontally } from "graphics-debug"
import { visualizeInputProblem } from "lib/solvers/LayoutPipelineSolver/visualizeInputProblem"
import { doBasicInputProblemLayout } from "lib/solvers/LayoutPipelineSolver/doBasicInputProblemLayout"
import type { DecouplingCapGroup } from "../IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"

export class ChipPartitionsSolver extends BaseSolver {
  inputProblem: InputProblem
  partitions: PartitionInputProblem[] = []
  decouplingCapGroups?: DecouplingCapGroup[]

  constructor({
    inputProblem,
    decouplingCapGroups,
  }: {
    inputProblem: InputProblem
    decouplingCapGroups?: DecouplingCapGroup[]
  }) {
    super()
    this.inputProblem = inputProblem
    this.decouplingCapGroups = decouplingCapGroups
  }

  override _step() {
    this.partitions = this.createPartitions(this.inputProblem)
    this.solved = true
  }

  private getPinNetIds(pinId: string, inputProblem: InputProblem): string[] {
    const netIds: string[] = []
    for (const [connKey, connected] of Object.entries(
      inputProblem.netConnMap,
    )) {
      if (!connected) continue
      if (!connKey.startsWith(`${pinId}-`)) continue
      netIds.push(connKey.slice(pinId.length + 1))
    }
    return netIds
  }

  private isPowerGroundNet(netId: string, inputProblem: InputProblem): boolean {
    const net = inputProblem.netMap[netId]
    return net?.isPositiveVoltageSource === true || net?.isGround === true
  }

  private getAlignmentGroupId(
    chip: Chip,
    inputProblem: InputProblem,
  ): string | null {
    if (chip.fixedPosition || chip.pins.length !== 2) return null

    const signalNetIds = new Set<string>()
    let connectedPowerGroundPinCount = 0

    for (const pinId of chip.pins) {
      const pinNetIds = this.getPinNetIds(pinId, inputProblem)
      if (pinNetIds.length === 0) return null

      let pinHasPowerGroundNet = false
      for (const netId of pinNetIds) {
        if (this.isPowerGroundNet(netId, inputProblem)) {
          pinHasPowerGroundNet = true
        } else {
          signalNetIds.add(netId)
        }
      }

      if (pinHasPowerGroundNet) connectedPowerGroundPinCount++
    }

    if (connectedPowerGroundPinCount === 0) return null
    if (signalNetIds.size === 0) return "power-ground"
    if (signalNetIds.size === 1) return `signal:${[...signalNetIds][0]}`
    return null
  }

  /**
   * Creates partitions by:
   * - Separating each decoupling capacitor group into its own partition (caps only, excluding the main chip)
   * - Grouping remaining passive aligned components (e.g. sharing power/ground or same net) into their own partitions
   * - Partitioning remaining chips by connected components through strong pin connections
   */
  private createPartitions(inputProblem: InputProblem): InputProblem[] {
    const chipIds = Object.keys(inputProblem.chipMap)

    const decapCapChipIds = new Set<ChipId>()
    if (this.decouplingCapGroups) {
      for (const group of this.decouplingCapGroups) {
        for (const capId of group.decouplingCapChipIds) {
          decapCapChipIds.add(capId)
        }
      }
    }

    // 1) Build decoupling-cap-only partitions (exclude the main chip for each group)
    const decapChipIdSet = new Set<ChipId>()
    const decapGroupPartitions: ChipId[][] = []

    if (this.decouplingCapGroups && this.decouplingCapGroups.length > 0) {
      for (const group of this.decouplingCapGroups) {
        const capsOnly: ChipId[] = []
        for (const capId of group.decouplingCapChipIds) {
          if (inputProblem.chipMap[capId]) {
            capsOnly.push(capId)
          }
        }
        // Only add a partition if there are at least two caps present in the inputProblem
        if (capsOnly.length >= 2) {
          decapGroupPartitions.push(capsOnly)
          // Mark these caps as handled by decoupling-cap partitions
          for (const capId of capsOnly) {
            decapChipIdSet.add(capId)
          }
        }
      }
    }

    // Find and group aligned passive components
    const alignmentGroupMap = new Map<string, ChipId[]>()
    for (const chipId of chipIds) {
      if (decapChipIdSet.has(chipId)) continue

      const chip = inputProblem.chipMap[chipId]
      if (!chip) continue

      const alignGroupId = this.getAlignmentGroupId(chip, inputProblem)
      if (alignGroupId) {
        const isDecap =
          chipId.toLowerCase().startsWith("c") || decapCapChipIds.has(chipId)
        if (!isDecap) continue

        const groupChips = alignmentGroupMap.get(alignGroupId) ?? []
        groupChips.push(chipId)
        alignmentGroupMap.set(alignGroupId, groupChips)
      }
    }

    const alignedGroupPartitions: ChipId[][] = []
    const alignedChipIdSet = new Set<ChipId>()
    for (const [groupId, groupChips] of alignmentGroupMap.entries()) {
      if (groupChips.length >= 2) {
        alignedGroupPartitions.push(groupChips)
        for (const chipId of groupChips) {
          alignedChipIdSet.add(chipId)
        }
      }
    }

    // 2) Build adjacency graph for remaining NON-decap/NON-aligned chips based on strong pin connections
    const nonDecapChipIds = chipIds.filter(
      (id) => !decapChipIdSet.has(id) && !alignedChipIdSet.has(id),
    )
    const adjacencyMap = new Map<ChipId, Set<ChipId>>()

    // Initialize adjacency map for non-decap chips
    for (const chipId of nonDecapChipIds) {
      adjacencyMap.set(chipId, new Set())
    }

    // Add edges based on strong pin connections, but exclude any edges touching decap/aligned chips
    for (const [connKey, isConnected] of Object.entries(
      inputProblem.pinStrongConnMap,
    )) {
      if (!isConnected) continue

      const [pin1Id, pin2Id] = connKey.split("-")

      // Find which chips own these pins
      const owner1 = this.findPinOwner(pin1Id!, inputProblem)
      const owner2 = this.findPinOwner(pin2Id!, inputProblem)

      // Only connect remaining chips
      if (
        owner1 &&
        owner2 &&
        owner1 !== owner2 &&
        !decapChipIdSet.has(owner1) &&
        !decapChipIdSet.has(owner2) &&
        !alignedChipIdSet.has(owner1) &&
        !alignedChipIdSet.has(owner2)
      ) {
        adjacencyMap.get(owner1)!.add(owner2)
        adjacencyMap.get(owner2)!.add(owner1)
      }
    }

    // 3) Find connected components among remaining chips using DFS
    const visited = new Set<ChipId>()
    const nonDecapPartitions: ChipId[][] = []

    for (const componentId of nonDecapChipIds) {
      if (!visited.has(componentId)) {
        const partition = this.dfs(componentId, adjacencyMap, visited)
        if (partition.length > 0) {
          nonDecapPartitions.push(partition)
        }
      }
    }

    return [
      ...decapGroupPartitions.map((partition) =>
        this.createInputProblemFromPartition(partition, inputProblem, {
          partitionType: "decoupling_caps",
        }),
      ),
      ...alignedGroupPartitions.map((partition) => {
        const firstChip = inputProblem.chipMap[partition[0]!]
        const alignGroupId = firstChip
          ? this.getAlignmentGroupId(firstChip, inputProblem)
          : null
        const isPowerGround =
          alignGroupId === "power-ground" &&
          partition[0]!.toLowerCase().startsWith("c")
        return this.createInputProblemFromPartition(partition, inputProblem, {
          partitionType: isPowerGround ? "decoupling_caps" : "default",
        })
      }),
      ...nonDecapPartitions.map((partition) =>
        this.createInputProblemFromPartition(partition, inputProblem),
      ),
    ]
  }

  /**
   * Finds the owner chip of a given pin
   */
  private findPinOwner(
    pinId: PinId,
    inputProblem: InputProblem,
  ): ChipId | null {
    // Check if it's a chip pin
    const chipPin = inputProblem.chipPinMap[pinId]
    if (chipPin) {
      // Find the chip that owns this pin
      for (const [chipId, chip] of Object.entries(inputProblem.chipMap)) {
        if (chip.pins.includes(pinId)) {
          return chipId
        }
      }
    }

    return null
  }

  /**
   * Depth-first search to find connected components
   */
  private dfs(
    startId: ChipId,
    adjacencyMap: Map<ChipId, Set<ChipId>>,
    visited: Set<ChipId>,
  ): ChipId[] {
    const partition: ChipId[] = []
    const stack = [startId]

    while (stack.length > 0) {
      const currentId = stack.pop()!

      if (visited.has(currentId)) continue

      visited.add(currentId)
      partition.push(currentId)

      const neighbors = adjacencyMap.get(currentId) || new Set()
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          stack.push(neighborId)
        }
      }
    }

    return partition
  }

  /**
   * Creates a new InputProblem containing only the components in the given partition
   */
  private createInputProblemFromPartition(
    partition: ChipId[],
    originalProblem: InputProblem,
    opts?: {
      partitionType?: "default" | "decoupling_caps"
    },
  ): PartitionInputProblem {
    const chipIds = partition

    // Extract relevant pins
    const relevantPinIds = new Set<PinId>()
    for (const chipId of chipIds) {
      const chip = originalProblem.chipMap[chipId]
      for (const pinId of chip!.pins) {
        relevantPinIds.add(pinId)
      }
    }

    // Build filtered maps
    const chipMap: Record<ChipId, any> = {}
    const chipPinMap: Record<PinId, any> = {}
    const netMap: Record<NetId, any> = {}
    const pinStrongConnMap: Record<string, boolean> = {}
    const netConnMap: Record<string, boolean> = {}

    // Copy chips and chip pins
    for (const chipId of chipIds) {
      chipMap[chipId] = originalProblem.chipMap[chipId]
    }
    for (const pinId of relevantPinIds) {
      if (originalProblem.chipPinMap[pinId]) {
        chipPinMap[pinId] = originalProblem.chipPinMap[pinId]
      }
    }

    // Copy relevant strong connections
    for (const [connKey, isConnected] of Object.entries(
      originalProblem.pinStrongConnMap,
    )) {
      const [pin1Id, pin2Id] = connKey.split("-")
      if (relevantPinIds.has(pin1Id!) && relevantPinIds.has(pin2Id!)) {
        pinStrongConnMap[connKey] = isConnected
      }
    }

    // Copy relevant nets and net connections
    const relevantNetIds = new Set<NetId>()
    for (const [connKey, isConnected] of Object.entries(
      originalProblem.netConnMap,
    )) {
      if (!isConnected) continue

      const [pinId, netId] = connKey.split("-")
      if (relevantPinIds.has(pinId!)) {
        relevantNetIds.add(netId!)
        netConnMap[connKey] = isConnected
      }
    }

    for (const netId of relevantNetIds) {
      if (originalProblem.netMap[netId]) {
        netMap[netId] = originalProblem.netMap[netId]
      }
    }

    return {
      ...originalProblem,
      chipMap,
      chipPinMap,
      netMap,
      pinStrongConnMap,
      netConnMap,
      isPartition: true,
      partitionType: opts?.partitionType,
    }
  }

  override visualize(): GraphicsObject {
    if (this.partitions.length === 0) {
      const layout = doBasicInputProblemLayout(this.inputProblem)
      return visualizeInputProblem(this.inputProblem, layout)
    }

    const partitionVisualizations = this.partitions.map((partition) => {
      const layout = doBasicInputProblemLayout(partition)
      return visualizeInputProblem(partition, layout)
    })

    const titles = this.partitions.map((_, index) => `partition${index}`)

    return stackGraphicsHorizontally(partitionVisualizations, { titles })
  }
}
