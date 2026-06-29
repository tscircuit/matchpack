/**
 * Post-processing solver that aligns passive components (resistors, capacitors, etc.)
 * that are strongly connected to the same side/edge of a large IC into a clean row
 * next to that IC edge, fixing "scattered passives" layouts.
 *
 * Runs after PartitionPackingSolver and before AlignPowerGroundRowsSolver.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { visualizeInputProblem } from "lib/solvers/LayoutPipelineSolver/visualizeInputProblem"
import type { Chip, ChipId, InputProblem, PinId } from "lib/types/InputProblem"
import type { Side } from "lib/types/Side"
import type { OutputLayout, Placement } from "lib/types/OutputLayout"

/**
 * A group of passive chips that all connect to the same side of the same IC.
 */
type SidePassiveGroup = {
  icChipId: ChipId
  side: Side
  passiveChipIds: ChipId[]
  /** Average Y offset of the IC pins these passives connect to (for horizontal grouping on x sides) */
  avgIcPinOffset: number
}

export class SideAwarePassiveGroupingSolver extends BaseSolver {
  inputProblem: InputProblem
  inputLayout: OutputLayout
  outputLayout: OutputLayout | null = null

  constructor(params: {
    inputProblem: InputProblem
    inputLayout: OutputLayout
  }) {
    super()
    this.inputProblem = params.inputProblem
    this.inputLayout = params.inputLayout
  }

  override _step() {
    this.outputLayout = this.createAlignedLayout()
    this.solved = true
  }

  /**
   * Returns true if a chip is a "large" IC (multi-pin, not a simple passive).
   * ICs are defined as having more than 2 pins.
   */
  private isIC(chip: Chip): boolean {
    return chip.pins.length > 2
  }

  /**
   * Returns true if a chip is a passive (2-pin component, no fixed position).
   */
  private isPassive(chip: Chip): boolean {
    return chip.pins.length === 2 && !chip.fixedPosition
  }

  /**
   * Returns the effective width and height of a chip given its placed rotation.
   */
  private getEffectiveSize(
    chip: Chip,
    rotation: number,
  ): { w: number; h: number } {
    const isRotated = rotation === 90 || rotation === 270
    return {
      w: isRotated ? chip.size.y : chip.size.x,
      h: isRotated ? chip.size.x : chip.size.y,
    }
  }

  /**
   * Finds the IC pin that is strongly connected to a given passive pin.
   * Returns { icChipId, icPinId, side } or null if not found.
   */
  private findStronglyConnectedICPin(passivePinId: PinId): {
    icChipId: ChipId
    icPinId: PinId
    side: Side
  } | null {
    for (const [connKey, connected] of Object.entries(
      this.inputProblem.pinStrongConnMap,
    )) {
      if (!connected) continue
      const [pinA, pinB] = connKey.split("-") as [PinId, PinId]
      let otherPin: PinId | null = null
      if (pinA === passivePinId) otherPin = pinB
      else if (pinB === passivePinId) otherPin = pinA
      if (!otherPin) continue

      // Find which chip owns otherPin
      for (const [chipId, chip] of Object.entries(this.inputProblem.chipMap)) {
        if (!this.isIC(chip)) continue
        if (chip.pins.includes(otherPin)) {
          const icPin = this.inputProblem.chipPinMap[otherPin]
          if (!icPin) continue
          return { icChipId: chipId, icPinId: otherPin, side: icPin.side }
        }
      }
    }
    return null
  }

  /**
   * Builds a list of SidePassiveGroups: groups of passives that all connect to
   * the same side of the same IC via strong pin-to-pin connections.
   * Only groups with 2+ passives are returned (single passives need no grouping).
   */
  private buildSidePassiveGroups(): SidePassiveGroup[] {
    // Map: "<icChipId>:<side>" -> { passiveChipIds: [], icPinOffsets: [] }
    const groupMap = new Map<
      string,
      {
        icChipId: ChipId
        side: Side
        passiveChipIds: ChipId[]
        icPinOffsets: number[]
      }
    >()

    for (const [chipId, chip] of Object.entries(this.inputProblem.chipMap)) {
      if (!this.isPassive(chip)) continue

      // Check both pins of the passive
      let found: { icChipId: ChipId; side: Side; icPinOffset: number } | null =
        null
      for (const pinId of chip.pins) {
        const result = this.findStronglyConnectedICPin(pinId)
        if (result) {
          const icPin = this.inputProblem.chipPinMap[result.icPinId]
          if (!icPin) continue
          // For horizontal IC sides (x+, x-), the relevant offset is Y.
          // For vertical IC sides (y+, y-), the relevant offset is X.
          const icPinOffset =
            result.side === "x+" || result.side === "x-"
              ? icPin.offset.y
              : icPin.offset.x
          found = {
            icChipId: result.icChipId,
            side: result.side,
            icPinOffset,
          }
          break
        }
      }

      if (!found) continue

      const key = `${found.icChipId}:${found.side}`
      let entry = groupMap.get(key)
      if (!entry) {
        entry = {
          icChipId: found.icChipId,
          side: found.side,
          passiveChipIds: [],
          icPinOffsets: [],
        }
        groupMap.set(key, entry)
      }
      entry.passiveChipIds.push(chipId)
      entry.icPinOffsets.push(found.icPinOffset)
    }

    // Return only groups with 2+ passives
    const groups: SidePassiveGroup[] = []
    for (const entry of groupMap.values()) {
      if (entry.passiveChipIds.length < 2) continue
      const avgIcPinOffset =
        entry.icPinOffsets.reduce((sum, v) => sum + v, 0) /
        entry.icPinOffsets.length
      groups.push({
        icChipId: entry.icChipId,
        side: entry.side,
        passiveChipIds: entry.passiveChipIds,
        avgIcPinOffset,
      })
    }

    return groups
  }

  /**
   * Arranges passives in a row/column aligned with the IC edge they connect to.
   */
  private alignPassivesToSide(
    chipPlacements: Record<ChipId, Placement>,
    group: SidePassiveGroup,
  ): void {
    const icPlacement = this.inputLayout.chipPlacements[group.icChipId]
    const icChip = this.inputProblem.chipMap[group.icChipId]
    if (!icPlacement || !icChip) return

    // Effective IC dimensions (considering rotation)
    const icRotation = icPlacement.ccwRotationDegrees
    const { w: icW, h: icH } = this.getEffectiveSize(icChip, icRotation)

    const gap =
      this.inputProblem.decouplingCapsGap ?? this.inputProblem.chipGap ?? 0.4

    // Sort passives by their current position along the axis parallel to the IC edge
    // so they end up in a sensible order
    const passivesWithInfo = group.passiveChipIds.map((passiveChipId) => {
      const passivePlacement = this.inputLayout.chipPlacements[passiveChipId]
      const passiveChip = this.inputProblem.chipMap[passiveChipId]
      const passiveRotation = passivePlacement?.ccwRotationDegrees ?? 0
      const { w: passiveW, h: passiveH } = this.getEffectiveSize(
        passiveChip!,
        passiveRotation,
      )
      return {
        passiveChipId,
        passiveChip: passiveChip!,
        passiveRotation,
        passiveW,
        passiveH,
        sortKey:
          group.side === "x+" || group.side === "x-"
            ? (passivePlacement?.y ?? 0)
            : (passivePlacement?.x ?? 0),
      }
    })

    // Sort by existing position along the IC edge axis
    passivesWithInfo.sort((a, b) => a.sortKey - b.sortKey)

    if (group.side === "y-" || group.side === "y+") {
      // IC left/right side in screen coordinates: passives form a horizontal row
      // placed above (y+) or below (y-) the IC

      // The row Y coordinate
      let rowY: number
      if (group.side === "y-") {
        // Below the IC (y decreases going down in schematic coords)
        const icBottom = icPlacement.y - icH / 2
        const maxPassiveH = Math.max(...passivesWithInfo.map((p) => p.passiveH))
        rowY = icBottom - gap - maxPassiveH / 2
      } else {
        // Above the IC
        const icTop = icPlacement.y + icH / 2
        const maxPassiveH = Math.max(...passivesWithInfo.map((p) => p.passiveH))
        rowY = icTop + gap + maxPassiveH / 2
      }

      // Total width of the row
      const totalW =
        passivesWithInfo.reduce((sum, p) => sum + p.passiveW, 0) +
        gap * (passivesWithInfo.length - 1)

      // Center the row around the IC's center X
      const rowStartX = icPlacement.x - totalW / 2

      let cursorX = rowStartX
      for (const info of passivesWithInfo) {
        chipPlacements[info.passiveChipId] = {
          x: cursorX + info.passiveW / 2,
          y: rowY,
          ccwRotationDegrees: info.passiveRotation,
        }
        cursorX += info.passiveW + gap
      }
    } else {
      // IC top/bottom side in screen coordinates: passives form a vertical column
      // placed to the left (x-) or right (x+) of the IC

      let colX: number
      if (group.side === "x-") {
        // Left of the IC
        const icLeft = icPlacement.x - icW / 2
        const maxPassiveW = Math.max(...passivesWithInfo.map((p) => p.passiveW))
        colX = icLeft - gap - maxPassiveW / 2
      } else {
        // Right of the IC
        const icRight = icPlacement.x + icW / 2
        const maxPassiveW = Math.max(...passivesWithInfo.map((p) => p.passiveW))
        colX = icRight + gap + maxPassiveW / 2
      }

      // Total height of the column
      const totalH =
        passivesWithInfo.reduce((sum, p) => sum + p.passiveH, 0) +
        gap * (passivesWithInfo.length - 1)

      // Center the column around the IC's center Y
      const colStartY = icPlacement.y - totalH / 2

      let cursorY = colStartY
      for (const info of passivesWithInfo) {
        chipPlacements[info.passiveChipId] = {
          x: colX,
          y: cursorY + info.passiveH / 2,
          ccwRotationDegrees: info.passiveRotation,
        }
        cursorY += info.passiveH + gap
      }
    }
  }

  private createAlignedLayout(): OutputLayout {
    const groups = this.buildSidePassiveGroups()

    // Start from the existing layout
    const chipPlacements: Record<string, Placement> = {
      ...this.inputLayout.chipPlacements,
    }

    for (const group of groups) {
      this.alignPassivesToSide(chipPlacements, group)
    }

    return {
      chipPlacements,
      groupPlacements: { ...this.inputLayout.groupPlacements },
    }
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.inputProblem,
      this.outputLayout ?? this.inputLayout,
    )
  }

  override getConstructorParams(): [
    { inputProblem: InputProblem; inputLayout: OutputLayout },
  ] {
    return [
      {
        inputProblem: this.inputProblem,
        inputLayout: this.inputLayout,
      },
    ]
  }
}
