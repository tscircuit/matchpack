import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { visualizeInputProblem } from "lib/solvers/LayoutPipelineSolver/visualizeInputProblem"
import type {
  Chip,
  ChipId,
  InputProblem,
  PartitionInputProblem,
} from "lib/types/InputProblem"
import type { OutputLayout, Placement } from "lib/types/OutputLayout"
import { getRotatedSize } from "lib/utils/rotatePinOffset"
import { getGapBetweenAlignedChips } from "./getGapBetweenAlignedChips"

type AlignmentGroup = {
  chipIds: ChipId[]
}

type ClearanceConstraint = {
  movingChipId: ChipId
  stationaryChipId: ChipId
  minimumGap: number
  referenceHorizontalSide?: "left" | "right"
}

const CLEARANCE_EPSILON = 1e-6

export class AlignPowerGroundRowsSolver extends BaseSolver {
  inputProblem: InputProblem
  inputLayout: OutputLayout
  partitions?: PartitionInputProblem[]
  outputLayout: OutputLayout | null = null
  private chipIdToPartition = new Map<ChipId, PartitionInputProblem>()

  constructor(params: {
    inputProblem: InputProblem
    inputLayout: OutputLayout
    partitions?: PartitionInputProblem[]
  }) {
    super()
    this.inputProblem = params.inputProblem
    this.inputLayout = params.inputLayout
    this.partitions = params.partitions

    for (const partition of this.partitions ?? []) {
      for (const chipId of Object.keys(partition.chipMap)) {
        this.chipIdToPartition.set(chipId, partition)
      }
    }
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

  private pinHasStrongConnection(pinId: string): boolean {
    for (const [connKey, connected] of Object.entries(
      this.inputProblem.pinStrongConnMap,
    )) {
      if (!connected) continue
      if (connKey.startsWith(`${pinId}-`) || connKey.endsWith(`-${pinId}`)) {
        return true
      }
    }

    return false
  }

  private getAlignmentGroupId(chip: Chip): string | null {
    if (chip.fixedPosition || chip.pins.length !== 2) return null

    const signalNetIds = new Set<string>()
    let connectedPowerGroundPinCount = 0

    for (const pinId of chip.pins) {
      const pinNetIds = this.getPinNetIds(pinId)
      if (pinNetIds.length === 0) {
        // A pin whose only connection is a direct pin-to-pin link anchors the
        // chip to that partner, and pulling the chip into a rail row would
        // separate them. An unconnected pin constrains nothing: one rail pin
        // is enough for the chip to belong to a row.
        if (this.pinHasStrongConnection(pinId)) return null
        continue
      }

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
      if (!chip) continue
      if (!this.inputLayout.chipPlacements[chipId]) continue

      const groupId = this.getAlignmentGroupId(chip)
      if (!groupId) continue

      const groupChipIds = groupMap.get(groupId) ?? []
      groupChipIds.push(chipId)
      groupMap.set(groupId, groupChipIds)
    }

    return [...groupMap.values()]
      .filter((groupChipIds) => groupChipIds.length > 1)
      .map((groupChipIds) => ({ chipIds: groupChipIds }))
  }

  private alignGroup(
    chipPlacements: Record<string, Placement>,
    chipIds: ChipId[],
  ): void {
    if (chipIds.length < 2) return

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

    for (const [index, chipId] of chipIds.entries()) {
      const previousChipId = chipIds[index - 1]
      if (previousChipId) {
        cursorX += getGapBetweenAlignedChips(
          { firstChipId: previousChipId, secondChipId: chipId },
          this.inputProblem,
          this.chipIdToPartition,
        )
      }

      const chip = this.inputProblem.chipMap[chipId]!
      const originalPlacement = this.inputLayout.chipPlacements[chipId]!
      const isRotated =
        originalPlacement.ccwRotationDegrees === 90 ||
        originalPlacement.ccwRotationDegrees === 270
      let width = chip.size.x
      if (isRotated) {
        width = chip.size.y
      }
      const x = cursorX + width / 2

      chipPlacements[chipId] = {
        x,
        y: rowY,
        ccwRotationDegrees: originalPlacement.ccwRotationDegrees,
      }

      cursorX += width
    }

    const rowWidth = cursorX
    for (const chipId of chipIds) {
      chipPlacements[chipId]!.x += rowCenterX - rowWidth / 2
    }
  }

  private getMinimumGap(chipIdA: ChipId, chipIdB: ChipId): number {
    const partitionA = this.chipIdToPartition.get(chipIdA)
    const partitionB = this.chipIdToPartition.get(chipIdB)

    if (partitionA && partitionB && partitionA !== partitionB) {
      return this.inputProblem.partitionGap
    }

    if (
      partitionA?.partitionType === "decoupling_caps" &&
      partitionA === partitionB
    ) {
      return this.inputProblem.decouplingCapsGap ?? this.inputProblem.chipGap
    }

    return this.inputProblem.chipGap
  }

  private getAxisGaps({
    chipIdA,
    placementA,
    chipIdB,
    placementB,
  }: {
    chipIdA: ChipId
    placementA: Placement
    chipIdB: ChipId
    placementB: Placement
  }): { x: number; y: number } {
    const chipA = this.inputProblem.chipMap[chipIdA]!
    const chipB = this.inputProblem.chipMap[chipIdB]!
    const sizeA = getRotatedSize(chipA.size, placementA.ccwRotationDegrees)
    const sizeB = getRotatedSize(chipB.size, placementB.ccwRotationDegrees)

    return {
      x: Math.abs(placementA.x - placementB.x) - (sizeA.x + sizeB.x) / 2,
      y: Math.abs(placementA.y - placementB.y) - (sizeA.y + sizeB.y) / 2,
    }
  }

  private placementsHaveMinimumGap({
    minimumGap,
    ...placements
  }: {
    chipIdA: ChipId
    placementA: Placement
    chipIdB: ChipId
    placementB: Placement
    minimumGap: number
  }): boolean {
    const gap = this.getAxisGaps(placements)
    return (
      gap.x >= minimumGap - CLEARANCE_EPSILON ||
      gap.y >= minimumGap - CLEARANCE_EPSILON
    )
  }

  private getClearanceConstraints(
    alignedGroupChipIds: Set<ChipId>,
    referencePlacements: Record<string, Placement>,
  ): ClearanceConstraint[] {
    const constraints: ClearanceConstraint[] = []

    for (const movingChipId of alignedGroupChipIds) {
      const movingPlacement = referencePlacements[movingChipId]
      if (!movingPlacement) continue

      for (const stationaryChipId of Object.keys(this.inputProblem.chipMap)) {
        if (alignedGroupChipIds.has(stationaryChipId)) continue
        const stationaryPlacement = referencePlacements[stationaryChipId]
        if (!stationaryPlacement) continue

        const minimumGap = this.getMinimumGap(movingChipId, stationaryChipId)
        const referenceHasMinimumGap = this.placementsHaveMinimumGap({
          chipIdA: movingChipId,
          placementA: movingPlacement,
          chipIdB: stationaryChipId,
          placementB: stationaryPlacement,
          minimumGap,
        })
        if (referenceHasMinimumGap) {
          constraints.push({
            movingChipId,
            stationaryChipId,
            minimumGap,
            referenceHorizontalSide:
              Math.abs(movingPlacement.x - stationaryPlacement.x) <=
              CLEARANCE_EPSILON
                ? undefined
                : movingPlacement.x < stationaryPlacement.x
                  ? "left"
                  : "right",
          })
        }
      }
    }

    return constraints
  }

  private getRestoringXOffsets(
    constraint: ClearanceConstraint,
    chipPlacements: Record<string, Placement>,
  ): number[] {
    const { movingChipId, stationaryChipId, minimumGap } = constraint
    const movingPlacement = chipPlacements[movingChipId]!
    const stationaryPlacement = chipPlacements[stationaryChipId]!
    const movingSize = getRotatedSize(
      this.inputProblem.chipMap[movingChipId]!.size,
      movingPlacement.ccwRotationDegrees,
    )
    const stationarySize = getRotatedSize(
      this.inputProblem.chipMap[stationaryChipId]!.size,
      stationaryPlacement.ccwRotationDegrees,
    )
    const clearance = (movingSize.x + stationarySize.x) / 2 + minimumGap
    const leftOffset = stationaryPlacement.x - clearance - movingPlacement.x
    const rightOffset = stationaryPlacement.x + clearance - movingPlacement.x

    if (constraint.referenceHorizontalSide === "left") return [leftOffset]
    if (constraint.referenceHorizontalSide === "right") return [rightOffset]
    return [leftOffset, rightOffset]
  }

  /**
   * Preserve the gaps established by partition packing without changing the
   * row's vertical alignment. A rigid horizontal move also preserves ordering;
   * if no such move is valid, the group keeps its packed placement.
   */
  private tryRestoreStationaryClearance(
    chipPlacements: Record<string, Placement>,
    referencePlacements: Record<string, Placement>,
    alignedGroupChipIds: Set<ChipId>,
  ): boolean {
    const constraints = this.getClearanceConstraints(
      alignedGroupChipIds,
      referencePlacements,
    )
    const candidateOffsets = [
      0,
      ...constraints.flatMap((constraint) =>
        this.getRestoringXOffsets(constraint, chipPlacements),
      ),
    ].sort((a, b) => Math.abs(a) - Math.abs(b))

    for (const offsetX of candidateOffsets) {
      const satisfiesAllConstraints = constraints.every((constraint) => {
        const movingPlacement = chipPlacements[constraint.movingChipId]!
        const stationaryPlacement = chipPlacements[constraint.stationaryChipId]!
        const candidateMovingPlacement = {
          ...movingPlacement,
          x: movingPlacement.x + offsetX,
        }
        const candidateGap = this.getAxisGaps({
          chipIdA: constraint.movingChipId,
          placementA: candidateMovingPlacement,
          chipIdB: constraint.stationaryChipId,
          placementB: stationaryPlacement,
        })

        // Horizontal side only matters when horizontal separation is needed.
        // Rows that remain vertically clear may pass above or below each other.
        if (candidateGap.y >= constraint.minimumGap - CLEARANCE_EPSILON) {
          return true
        }

        if (
          constraint.referenceHorizontalSide === "left" &&
          candidateMovingPlacement.x >= stationaryPlacement.x
        ) {
          return false
        }
        if (
          constraint.referenceHorizontalSide === "right" &&
          candidateMovingPlacement.x <= stationaryPlacement.x
        ) {
          return false
        }

        return candidateGap.x >= constraint.minimumGap - CLEARANCE_EPSILON
      })
      if (!satisfiesAllConstraints) continue

      for (const chipId of alignedGroupChipIds) {
        chipPlacements[chipId]!.x += offsetX
      }
      return true
    }

    return false
  }

  private hasChipOverlap(chipPlacements: Record<string, Placement>): boolean {
    const chipIds = Object.keys(this.inputProblem.chipMap)

    for (let i = 0; i < chipIds.length; i++) {
      const chipIdA = chipIds[i]!
      const placementA = chipPlacements[chipIdA]
      if (!placementA) continue

      for (let j = i + 1; j < chipIds.length; j++) {
        const chipIdB = chipIds[j]!
        const placementB = chipPlacements[chipIdB]
        if (!placementB) continue

        const gap = this.getAxisGaps({
          chipIdA,
          placementA,
          chipIdB,
          placementB,
        })
        if (gap.x < 0 && gap.y < 0) return true
      }
    }

    return false
  }

  private createAlignedLayout(): OutputLayout | null {
    const groups = this.getAlignmentGroups()
    if (!groups) return null

    // Preserve the existing all-or-nothing collision guard before attempting
    // any clearance-preserving translation of individual rows.
    const rawAlignedPlacements = { ...this.inputLayout.chipPlacements }
    for (const group of groups) {
      this.alignGroup(rawAlignedPlacements, group.chipIds)
    }
    if (this.hasChipOverlap(rawAlignedPlacements)) return null

    const chipPlacements: Record<string, Placement> = {
      ...this.inputLayout.chipPlacements,
    }

    for (const group of groups) {
      const candidatePlacements = { ...chipPlacements }
      this.alignGroup(candidatePlacements, group.chipIds)

      const clearanceWasRestored = this.tryRestoreStationaryClearance(
        candidatePlacements,
        chipPlacements,
        new Set(group.chipIds),
      )
      if (clearanceWasRestored) {
        Object.assign(chipPlacements, candidatePlacements)
      }
    }

    if (this.hasChipOverlap(chipPlacements)) return null

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
    {
      inputProblem: InputProblem
      inputLayout: OutputLayout
      partitions?: PartitionInputProblem[]
    },
  ] {
    return [
      {
        inputProblem: this.inputProblem,
        inputLayout: this.inputLayout,
        partitions: this.partitions,
      },
    ]
  }
}
