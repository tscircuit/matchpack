import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { visualizeInputProblem } from "lib/solvers/LayoutPipelineSolver/visualizeInputProblem"
import type { Chip, ChipId, InputProblem } from "lib/types/InputProblem"
import type { OutputLayout, Placement } from "lib/types/OutputLayout"

type AlignmentGroup = {
  chipIds: ChipId[]
}

export class AlignPowerGroundRowsSolver extends BaseSolver {
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
    this.outputLayout = this.createAlignedLayout() ?? this.inputLayout
    this.solved = true
  }

  private isPowerGroundNet(netId: string): boolean {
    const net = this.inputProblem.netMap[netId]
    return net?.isPositiveVoltageSource === true || net?.isGround === true
  }

  private getPinNetIds(pinId: string): string[] {
    const netIds: string[] = []

    for (const [connKey, connected] of Object.entries(
      this.inputProblem.netConnMap,
    )) {
      if (!connected) continue
      if (!connKey.startsWith(`${pinId}-`)) continue
      netIds.push(connKey.slice(pinId.length + 1))
    }

    return netIds
  }

  private getAlignmentGroupId(chip: Chip): string | null {
    if (chip.fixedPosition || chip.pins.length !== 2) return null

    const signalNetIds = new Set<string>()
    let connectedPowerGroundPinCount = 0

    for (const pinId of chip.pins) {
      const pinNetIds = this.getPinNetIds(pinId)
      if (pinNetIds.length === 0) return null

      let pinHasPowerGroundNet = false
      for (const netId of pinNetIds) {
        if (this.isPowerGroundNet(netId)) {
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

  private getAlignmentGroups(): AlignmentGroup[] | null {
    const chipIds = Object.keys(this.inputProblem.chipMap)
    if (chipIds.length < 2) return null

    const groupMap = new Map<string, ChipId[]>()

    for (const chipId of chipIds) {
      const chip = this.inputProblem.chipMap[chipId]
      if (!chip) return null
      if (!this.inputLayout.chipPlacements[chipId]) return null

      const groupId = this.getAlignmentGroupId(chip)
      if (!groupId) return null

      const groupChipIds = groupMap.get(groupId) ?? []
      groupChipIds.push(chipId)
      groupMap.set(groupId, groupChipIds)
    }

    return [...groupMap.values()].map((groupChipIds) => ({
      chipIds: groupChipIds.sort(
        (chipIdA, chipIdB) =>
          this.inputLayout.chipPlacements[chipIdA]!.x -
          this.inputLayout.chipPlacements[chipIdB]!.x,
      ),
    }))
  }

  private alignGroup(
    chipPlacements: Record<string, Placement>,
    chipIds: ChipId[],
  ): void {
    if (chipIds.length < 2) return

    const firstChipId = chipIds[0]
    const firstChip = firstChipId
      ? this.inputProblem.chipMap[firstChipId]
      : null
    const groupId = firstChip ? this.getAlignmentGroupId(firstChip) : null

    let gap = this.inputProblem.partitionGap
    if (groupId === "power-ground") {
      gap = this.inputProblem.decouplingCapsGap ?? 0.4
    }

    let cursorX = 0
    const rowY =
      chipIds.reduce(
        (sum, chipId) => sum + this.inputLayout.chipPlacements[chipId]!.y,
        0,
      ) / chipIds.length
    const rowCenterX =
      chipIds.reduce(
        (sum, chipId) => sum + this.inputLayout.chipPlacements[chipId]!.x,
        0,
      ) / chipIds.length

    for (const chipId of chipIds) {
      const chip = this.inputProblem.chipMap[chipId]!
      const originalPlacement = this.inputLayout.chipPlacements[chipId]!
      const isRotated =
        originalPlacement.ccwRotationDegrees === 90 ||
        originalPlacement.ccwRotationDegrees === 270
      const width = isRotated ? chip.size.y : chip.size.x
      const x = cursorX + width / 2

      chipPlacements[chipId] = {
        x,
        y: rowY,
        ccwRotationDegrees: originalPlacement.ccwRotationDegrees,
      }

      cursorX += width + gap
    }

    const rowWidth = cursorX - gap
    for (const chipId of chipIds) {
      chipPlacements[chipId]!.x += rowCenterX - rowWidth / 2
    }
  }

  private createAlignedLayout(): OutputLayout | null {
    const groups = this.getAlignmentGroups()
    if (!groups) return null

    const chipPlacements: Record<string, Placement> = {
      ...this.inputLayout.chipPlacements,
    }

    for (const group of groups) {
      this.alignGroup(chipPlacements, group.chipIds)
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
