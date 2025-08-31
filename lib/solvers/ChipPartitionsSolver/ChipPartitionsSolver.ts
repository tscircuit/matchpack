/**
 * Creates partitions (small subset groups) surrounding complex chips.
 * Divides the layout problem into manageable sections for more efficient processing.
 */

import { BaseSolver } from "../BaseSolver"
import type { InputProblem, ChipId, PinId, NetId } from "lib/types/InputProblem"
import type { GraphicsObject } from "graphics-debug"
import { stackGraphicsHorizontally } from "graphics-debug"
import { visualizeInputProblem } from "lib/solvers/LayoutPipelineSolver/visualizeInputProblem"
import { doBasicInputProblemLayout } from "lib/solvers/LayoutPipelineSolver/doBasicInputProblemLayout"

export class ChipPartitionsSolver extends BaseSolver {
  inputProblem: InputProblem
  partitions: InputProblem[] = []

  constructor(inputProblem: InputProblem) {
    super()
    this.inputProblem = inputProblem
  }

  override _step() {
    this.partitions = this.createPartitions(this.inputProblem)
    this.solved = true
  }

  /**
   * Creates partitions by finding connected components through strong pin connections
   * and keeping symmetric groups together
   */
  private createPartitions(inputProblem: InputProblem): InputProblem[] {
    const chipIds = Object.keys(inputProblem.chipMap)

    // Build adjacency graph based on strong pin connections
    const adjacencyMap = new Map<ChipId, Set<ChipId>>()

    // Initialize adjacency map
    for (const chipId of chipIds) {
      adjacencyMap.set(chipId, new Set())
    }

    // Add edges based on strong pin connections
    for (const [connKey, isConnected] of Object.entries(
      inputProblem.pinStrongConnMap,
    )) {
      if (!isConnected) continue

      const [pin1Id, pin2Id] = connKey.split("-")

      // Find which chips/groups own these pins
      const owner1 = this.findPinOwner(pin1Id!, inputProblem)
      const owner2 = this.findPinOwner(pin2Id!, inputProblem)

      if (owner1 && owner2 && owner1 !== owner2) {
        adjacencyMap.get(owner1)!.add(owner2)
        adjacencyMap.get(owner2)!.add(owner1)
      }
    }

    // Add symmetric group connections to keep related components together
    this.addSymmetricGroupConnections(adjacencyMap, chipIds)

    // Find connected components using DFS
    const visited = new Set<ChipId>()
    const partitions: ChipId[][] = []

    for (const componentId of chipIds) {
      if (!visited.has(componentId)) {
        const partition = this.dfs(componentId, adjacencyMap, visited)
        if (partition.length > 0) {
          partitions.push(partition)
        }
      }
    }

    // Convert partitions to InputProblem instances
    return partitions.map((partition) =>
      this.createInputProblemFromPartition(partition, inputProblem),
    )
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
  ): InputProblem {
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
      chipMap,
      chipPinMap,
      netMap,
      pinStrongConnMap,
      netConnMap,
      chipGap: originalProblem.chipGap,
      partitionGap: originalProblem.partitionGap,
    }
  }

  override visualize(): GraphicsObject {
    if (this.partitions.length === 0) {
      return super.visualize()
    }

    const partitionVisualizations = this.partitions.map((partition) => {
      const layout = doBasicInputProblemLayout(partition)
      return visualizeInputProblem(partition, layout)
    })

    const titles = this.partitions.map((_, index) => `partition${index}`)

    return stackGraphicsHorizontally(partitionVisualizations, { titles })
  }

  /**
   * Adds edges between symmetric components to keep them in the same partition
   */
  private addSymmetricGroupConnections(
    adjacencyMap: Map<ChipId, Set<ChipId>>,
    chipIds: ChipId[],
  ): void {
    const symmetricGroups = this.detectSymmetricGroups(chipIds)

    // Connect all components within each symmetric group
    for (const group of symmetricGroups) {
      for (let i = 0; i < group.chipIds.length; i++) {
        for (let j = i + 1; j < group.chipIds.length; j++) {
          const chipA = group.chipIds[i]!
          const chipB = group.chipIds[j]!
          adjacencyMap.get(chipA)!.add(chipB)
          adjacencyMap.get(chipB)!.add(chipA)
        }
      }
    }
  }

  /**
   * Detects symmetric groups based on component properties and connectivity patterns
   * Does not rely on naming conventions
   */
  private detectSymmetricGroups(
    chipIds: ChipId[],
  ): Array<{ id: string; chipIds: ChipId[] }> {
    const groups: Array<{ id: string; chipIds: ChipId[] }> = []
    const processedChips = new Set<ChipId>()

    // Group components by their characteristics
    for (const chipId of chipIds) {
      if (processedChips.has(chipId)) continue

      const similarChips = this.findComponentsWithSimilarCharacteristics(
        chipId,
        chipIds,
        processedChips,
      )

      if (similarChips.length >= 2) {
        const groupId = `symmetric_${this.getComponentSignature(chipId)}`
        groups.push({
          id: groupId,
          chipIds: similarChips.sort(),
        })

        similarChips.forEach((id) => processedChips.add(id))
      }
    }

    return groups
  }

  /**
   * Finds components with similar characteristics (size, pins, connectivity)
   */
  private findComponentsWithSimilarCharacteristics(
    targetChip: ChipId,
    allChips: ChipId[],
    processedChips: Set<ChipId>,
  ): ChipId[] {
    const similarChips = [targetChip]
    const targetSignature = this.getComponentSignature(targetChip)

    for (const otherChip of allChips) {
      if (otherChip === targetChip || processedChips.has(otherChip)) continue

      const otherSignature = this.getComponentSignature(otherChip)

      // Check if they have similar characteristics
      if (this.areSignaturesSimilar(targetSignature, otherSignature)) {
        similarChips.push(otherChip)
      }
    }

    return similarChips
  }

  /**
   * Creates a signature based on component characteristics
   */
  private getComponentSignature(chipId: ChipId): string {
    const chip = this.inputProblem.chipMap[chipId]!
    const pinCount = chip.pins.length
    const sizeX = Math.round(chip.size.x * 100) / 100
    const sizeY = Math.round(chip.size.y * 100) / 100
    const rotations = chip.availableRotations?.join(",") || "any"

    // Get connectivity pattern - how many nets this component connects to
    const connectedNets = new Set<NetId>()
    for (const pinId of chip.pins) {
      // Use netConnMap to find which nets this pin connects to
      for (const [key, connected] of Object.entries(
        this.inputProblem.netConnMap,
      )) {
        if (connected && key.startsWith(`${pinId}-`)) {
          const netId = key.split("-")[1]!
          connectedNets.add(netId)
        }
      }
    }
    const netCount = connectedNets.size

    return `pins:${pinCount}_size:${sizeX}x${sizeY}_nets:${netCount}_rot:${rotations}`
  }

  /**
   * Checks if two component signatures are similar enough to be grouped
   */
  private areSignaturesSimilar(sig1: string, sig2: string): boolean {
    return sig1 === sig2
  }
}
