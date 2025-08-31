/**
 * Packs components within a single partition to create an optimal internal layout.
 * Uses a packing algorithm to arrange chips and their connections within the partition.
 */

import type { GraphicsObject } from "graphics-debug"
import { type PackInput, PackSolver2 } from "calculate-packing"
import { BaseSolver } from "../BaseSolver"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import type {
  InputProblem,
  PinId,
  ChipId,
  NetId,
} from "../../types/InputProblem"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

interface SymmetricGroup {
  id: string
  chipIds: ChipId[]
  priority: number
}

export class SingleInnerPartitionPackingSolver extends BaseSolver {
  inputProblem: InputProblem
  layout: OutputLayout | null = null
  declare activeSubSolver: PackSolver2 | null
  private symmetricGroups: SymmetricGroup[] = []

  constructor(inputProblem: InputProblem) {
    super()
    this.inputProblem = inputProblem

    // Debug: Log detected symmetric groups
    const chipIds = Object.keys(this.inputProblem.chipMap)
    this.symmetricGroups = this.detectSymmetricGroups(chipIds)
    console.log(
      `🧩 Processing partition with ${chipIds.length} chips: [${chipIds.join(", ")}]`,
    )
    if (this.symmetricGroups.length > 0) {
      console.log(
        `🔍 Detected ${this.symmetricGroups.length} symmetric groups:`,
      )
      for (const group of this.symmetricGroups) {
        console.log(
          `  - ${group.id}: [${group.chipIds.join(", ")}] (priority: ${group.priority})`,
        )
      }
    }
  }

  override _step() {
    // Initialize PackSolver2 if not already created
    if (!this.activeSubSolver) {
      const packInput = this.createPackInput()
      this.activeSubSolver = new PackSolver2(packInput)
      this.activeSubSolver = this.activeSubSolver
    }

    // Run one step of the PackSolver2
    this.activeSubSolver.step()

    if (this.activeSubSolver.failed) {
      this.failed = true
      this.error = `PackSolver2 failed: ${this.activeSubSolver.error}`
      return
    }

    if (this.activeSubSolver.solved) {
      // Apply the packing result to create the layout
      this.layout = this.createLayoutFromPackingResult(
        this.activeSubSolver.packedComponents,
      )
      this.solved = true
      this.activeSubSolver = null
    }
  }

  private createPackInput(): PackInput {
    // Create filtered network mapping to prevent opposite-side weak connections
    // from interfering with strong connections during packing
    const strongConnections = this.inputProblem.pinStrongConnMap
    // Create pack components for each chip
    const packComponents = Object.entries(this.inputProblem.chipMap).map(
      ([chipId, chip]) => {
        // Create pads for all pins of this chip
        const pads: Array<{
          padId: string
          networkId: string
          type: "rect"
          offset: { x: number; y: number }
          size: { x: number; y: number }
        }> = []

        // Add chip body pad (disconnected from any network)
        pads.push({
          padId: `${chipId}_body`,
          networkId: `${chipId}_body_disconnected`,
          type: "rect" as const,
          offset: { x: 0, y: 0 },
          size: { x: chip.size.x, y: chip.size.y },
        })

        // Create a pad for each pin on this chip
        for (const pinId of chip.pins) {
          const pin = this.inputProblem.chipPinMap[pinId]
          if (!pin) continue

          // Find network for this pin from our connectivity map
          let networkId = `net_${pin.pinId}`
          for (const [key, connected] of Object.entries(
            this.inputProblem.netConnMap,
          )) {
            if (connected && key.startsWith(`${pin.pinId}-`)) {
              networkId = key.split("-")[1]!
              break
            }
          }

          pads.push({
            padId: pinId,
            networkId: networkId,
            type: "rect" as const,
            offset: { x: pin.offset.x, y: pin.offset.y },
            size: { x: 0.1, y: 0.1 }, // Small size for pins
          })
        }

        return {
          componentId: chipId,
          pads,
          availableRotationDegrees: chip.availableRotations || [
            0, 90, 180, 270,
          ],
        }
      },
    )

    return {
      components: this.applySymmetricConstraints(packComponents),
      minGap: this.inputProblem.chipGap,
      packOrderStrategy: "largest_to_smallest",
      packPlacementStrategy: "minimum_sum_squared_distance_to_network",
    }
  }

  private createLayoutFromPackingResult(
    packedComponents: PackSolver2["packedComponents"],
  ): OutputLayout {
    const chipPlacements: Record<string, Placement> = {}

    // First, create initial placements from packing result
    for (const packedComponent of packedComponents) {
      const chipId = packedComponent.componentId
      chipPlacements[chipId] = {
        x: packedComponent.center.x,
        y: packedComponent.center.y,
        ccwRotationDegrees:
          packedComponent.ccwRotationOffset ||
          packedComponent.ccwRotationDegrees ||
          0,
      }
    }

    // Apply symmetric layout optimizations
    this.optimizeSymmetricGroupPlacements(chipPlacements)

    return {
      chipPlacements,
      groupPlacements: {},
    }
  }

  override visualize(): GraphicsObject {
    if (this.activeSubSolver && !this.solved) {
      return this.activeSubSolver.visualize()
    }

    if (!this.layout) {
      return super.visualize()
    }

    return visualizeInputProblem(this.inputProblem, this.layout)
  }

  /**
   * Detects symmetric groups in the input problem
   */
  private detectSymmetricGroups(chipIds: ChipId[]): SymmetricGroup[] {
    console.log(
      `🔍 Analyzing ${chipIds.length} chips for symmetric patterns based on properties...`,
    )

    const groups: SymmetricGroup[] = []
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
          priority: similarChips.length * 10,
        })

        similarChips.forEach((id) => processedChips.add(id))
      }
    }

    // Sort groups by priority (highest first)
    return groups.sort((a, b) => b.priority - a.priority)
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
    const connectedNets = new Set<string>()
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

  /**
   * Calculates optimal grid dimensions based on component count and spacing efficiency
   */
  private calculateOptimalGridDimensions(componentCount: number): {
    gridWidth: number
    gridHeight: number
  } {
    if (componentCount <= 2) {
      // For small groups, arrange in a row
      return { gridWidth: componentCount, gridHeight: 1 }
    }

    if (componentCount <= 4) {
      // For medium groups, prefer 2x2 or 2x1 arrangements
      return componentCount === 3
        ? { gridWidth: 3, gridHeight: 1 }
        : { gridWidth: 2, gridHeight: 2 }
    }

    // For larger groups, aim for roughly square arrangements
    const idealRatio = 1.2 // Slightly prefer wider than tall
    const sqrt = Math.sqrt(componentCount)
    let gridWidth = Math.ceil(sqrt * idealRatio)
    let gridHeight = Math.ceil(componentCount / gridWidth)

    // Adjust to minimize empty spots
    while (gridWidth * gridHeight - componentCount > componentCount * 0.3) {
      gridWidth -= 1
      gridHeight = Math.ceil(componentCount / gridWidth)
    }

    return { gridWidth, gridHeight }
  }

  /**
   * Applies symmetric constraints to pack components to encourage grid-like layouts
   */
  private applySymmetricConstraints(packComponents: any[]): any[] {
    if (this.symmetricGroups.length === 0) {
      return packComponents
    }

    // Create a map of chipId to group for quick lookup
    const chipToGroupMap = new Map<ChipId, SymmetricGroup>()
    for (const group of this.symmetricGroups) {
      for (const chipId of group.chipIds) {
        chipToGroupMap.set(chipId, group)
      }
    }

    // Apply constraints to encourage symmetric placement
    return packComponents.map((component) => {
      const group = chipToGroupMap.get(component.componentId)
      if (!group) return component

      // For symmetric groups, limit rotations to maintain consistency
      const restrictedRotations = [0] // No rotation to maintain alignment

      return {
        ...component,
        availableRotationDegrees: restrictedRotations,
        // Add metadata for the packing algorithm
        symmetricGroupId: group.id,
        symmetricGroupPriority: group.priority,
      }
    })
  }

  /**
   * Optimizes placement for detected symmetric groups to create grid-aligned layouts
   */
  private optimizeSymmetricGroupPlacements(
    chipPlacements: Record<string, Placement>,
  ): void {
    if (this.symmetricGroups.length === 0) return

    console.log(
      `🔧 Optimizing placement for ${this.symmetricGroups.length} symmetric groups`,
    )
    for (const group of this.symmetricGroups) {
      console.log(
        `   Arranging group ${group.id} with ${group.chipIds.length} components in optimal layout`,
      )
      this.arrangeGroupInGrid(group, chipPlacements)
    }
    console.log(`✓ Symmetric group optimization complete`)
  }

  /**
   * Arranges a symmetric group in a grid or row pattern
   */
  private arrangeGroupInGrid(
    group: SymmetricGroup,
    chipPlacements: Record<string, Placement>,
  ): void {
    if (group.chipIds.length === 0) return

    // Calculate the centroid of the group's current positions
    let centerX = 0
    let centerY = 0
    for (const chipId of group.chipIds) {
      const placement = chipPlacements[chipId]
      if (placement) {
        centerX += placement.x
        centerY += placement.y
      }
    }
    centerX /= group.chipIds.length
    centerY /= group.chipIds.length

    // Determine optimal grid dimensions based on component count and available space
    const componentCount = group.chipIds.length
    const { gridWidth, gridHeight } =
      this.calculateOptimalGridDimensions(componentCount)

    // Calculate spacing based on component sizes with extra margin to prevent overlaps
    const avgChipSize = this.calculateAverageChipSize(group.chipIds)
    const minGap = this.inputProblem.chipGap || 1

    // Use more conservative spacing for large groups to prevent overlaps
    const baseSpacingMultiplier = Math.min(
      5,
      2 + Math.sqrt(componentCount) * 0.5,
    )
    const spacingX =
      Math.max(avgChipSize.x * baseSpacingMultiplier, 6) + minGap * 6
    const spacingY =
      Math.max(avgChipSize.y * baseSpacingMultiplier, 6) + minGap * 6

    // Calculate starting position to center the grid
    const startX = centerX - ((gridWidth - 1) * spacingX) / 2
    const startY = centerY - ((gridHeight - 1) * spacingY) / 2

    // Arrange components in grid
    group.chipIds.forEach((chipId, index) => {
      const row = Math.floor(index / gridWidth)
      const col = index % gridWidth

      const placement = chipPlacements[chipId]
      if (placement) {
        const newX = startX + col * spacingX
        const newY = startY + row * spacingY

        // Keep consistent rotation within group
        const targetRotation = 0 // Force all components in group to same rotation

        // Apply placement with additional overlap prevention
        chipPlacements[chipId] = {
          x: newX,
          y: newY,
          ccwRotationDegrees: targetRotation,
        }

        console.log(
          `    Placed ${chipId} at (${newX.toFixed(2)}, ${newY.toFixed(2)})`,
        )
      }
    })
  }

  /**
   * Calculates average size of chips in a group
   */
  private calculateAverageChipSize(chipIds: ChipId[]): {
    x: number
    y: number
  } {
    let totalX = 0
    let totalY = 0
    let validChips = 0

    for (const chipId of chipIds) {
      const chip = this.inputProblem.chipMap[chipId]
      if (chip) {
        totalX += chip.size.x
        totalY += chip.size.y
        validChips++
      }
    }

    return validChips > 0
      ? { x: totalX / validChips, y: totalY / validChips }
      : { x: 2, y: 2 } // Default size
  }

  override getConstructorParams(): [InputProblem] {
    return [this.inputProblem]
  }
}
