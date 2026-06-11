/**
 * Pipeline solver that runs a series of solvers to find the best schematic layout.
 * Coordinates the entire layout process from chip partitioning through final packing.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { ChipPartitionsSolver } from "lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import { IdentifyDecouplingCapsSolver } from "lib/solvers/IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import {
  PackInnerPartitionsSolver,
  type PackedPartition,
} from "lib/solvers/PackInnerPartitionsSolver/PackInnerPartitionsSolver"
import { PartitionPackingSolver } from "lib/solvers/PartitionPackingSolver/PartitionPackingSolver"
import type { ChipPin, InputProblem, PinId } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import { doBasicInputProblemLayout } from "./doBasicInputProblemLayout"
import { visualizeInputProblem } from "./visualizeInputProblem"
import { getPinIdToStronglyConnectedPinsObj } from "./getPinIdToStronglyConnectedPinsObj"

type PipelineStep<T extends new (...args: any[]) => BaseSolver> = {
  solverName: string
  solverClass: T
  getConstructorParams: (
    instance: LayoutPipelineSolver,
  ) => ConstructorParameters<T>
  onSolved?: (instance: LayoutPipelineSolver) => void
}

function definePipelineStep<
  T extends new (
    ...args: any[]
  ) => BaseSolver,
  const P extends ConstructorParameters<T>,
>(
  solverName: keyof LayoutPipelineSolver,
  solverClass: T,
  getConstructorParams: (instance: LayoutPipelineSolver) => P,
  opts: {
    onSolved?: (instance: LayoutPipelineSolver) => void
  } = {},
): PipelineStep<T> {
  return {
    solverName,
    solverClass,
    getConstructorParams,
    onSolved: opts.onSolved,
  }
}

export class LayoutPipelineSolver extends BaseSolver {
  identifyDecouplingCapsSolver?: IdentifyDecouplingCapsSolver
  chipPartitionsSolver?: ChipPartitionsSolver
  packInnerPartitionsSolver?: PackInnerPartitionsSolver
  partitionPackingSolver?: PartitionPackingSolver

  startTimeOfPhase: Record<string, number>
  endTimeOfPhase: Record<string, number>
  timeSpentOnPhase: Record<string, number>
  firstIterationOfPhase: Record<string, number>

  // Computed utility objects
  pinIdToStronglyConnectedPins: Record<PinId, ChipPin[]>

  inputProblem: InputProblem
  chipPartitions?: ChipPartitionsSolver["partitions"]
  packedPartitions?: PackedPartition[]

  pipelineDef = [
    definePipelineStep(
      "identifyDecouplingCapsSolver",
      IdentifyDecouplingCapsSolver,
      () => [this.inputProblem],
      {
        onSolved: (_layoutSolver) => {
          // Decoupling cap groups are now identified and available for subsequent phases
        },
      },
    ),
    definePipelineStep(
      "chipPartitionsSolver",
      ChipPartitionsSolver,
      () => [
        {
          inputProblem: this.inputProblem,
          decouplingCapGroups:
            this.identifyDecouplingCapsSolver?.outputDecouplingCapGroups,
        },
      ],
      {
        onSolved: (_layoutSolver) => {
          this.chipPartitions = this.chipPartitionsSolver!.partitions
        },
      },
    ),
    definePipelineStep(
      "packInnerPartitionsSolver",
      PackInnerPartitionsSolver,
      () => [
        {
          partitions: this.chipPartitions!,
          pinIdToStronglyConnectedPins: this.pinIdToStronglyConnectedPins,
        },
      ],
      {
        onSolved: (_solver) => {
          this.packedPartitions =
            this.packInnerPartitionsSolver!.packedPartitions
        },
      },
    ),
    definePipelineStep(
      "partitionPackingSolver",
      PartitionPackingSolver,
      () => [
        {
          packedPartitions: this.packedPartitions || [],
          inputProblem: this.inputProblem,
        },
      ],
      {
        onSolved: (_solver) => {
          this.applyDecouplingCapGroupLayout()
        },
      },
    ),
  ]

  constructor(inputProblem: InputProblem) {
    super()
    this.inputProblem = inputProblem
    this.MAX_ITERATIONS = 1e6
    this.startTimeOfPhase = {}
    this.endTimeOfPhase = {}
    this.timeSpentOnPhase = {}
    this.firstIterationOfPhase = {}
    this.pinIdToStronglyConnectedPins =
      getPinIdToStronglyConnectedPinsObj(inputProblem)
  }

  currentPipelineStepIndex = 0

  override _step() {
    const pipelineStepDef = this.pipelineDef[this.currentPipelineStepIndex]
    if (!pipelineStepDef) {
      this.solved = true
      return
    }

    if (this.activeSubSolver) {
      this.activeSubSolver.step()
      if (this.activeSubSolver.solved) {
        this.endTimeOfPhase[pipelineStepDef.solverName] = performance.now()
        this.timeSpentOnPhase[pipelineStepDef.solverName] =
          this.endTimeOfPhase[pipelineStepDef.solverName]! -
          this.startTimeOfPhase[pipelineStepDef.solverName]!
        pipelineStepDef.onSolved?.(this)
        this.activeSubSolver = null
        this.currentPipelineStepIndex++
      } else if (this.activeSubSolver.failed) {
        this.error = this.activeSubSolver?.error
        this.failed = true
        this.activeSubSolver = null
      }
      return
    }

    const constructorParams = pipelineStepDef.getConstructorParams(this)
    // @ts-ignore
    this.activeSubSolver = new pipelineStepDef.solverClass(...constructorParams)
    ;(this as any)[pipelineStepDef.solverName] = this.activeSubSolver
    this.timeSpentOnPhase[pipelineStepDef.solverName] = 0
    this.startTimeOfPhase[pipelineStepDef.solverName] = performance.now()
    this.firstIterationOfPhase[pipelineStepDef.solverName] = this.iterations
  }

  solveUntilPhase(phase: string) {
    while (this.getCurrentPhase() !== phase) {
      this.step()
    }
  }

  getCurrentPhase(): string {
    return this.pipelineDef[this.currentPipelineStepIndex]?.solverName ?? "none"
  }

  private applyDecouplingCapGroupLayout() {
    const finalLayout = this.partitionPackingSolver?.finalLayout
    const groups = this.identifyDecouplingCapsSolver?.outputDecouplingCapGroups
    if (!finalLayout || !groups?.length) return

    const laneCountByMainSide = new Map<string, number>()

    for (const group of groups) {
      const mainPlacement = finalLayout.chipPlacements[group.mainChipId]
      const mainChip = this.inputProblem.chipMap[group.mainChipId]
      if (!mainPlacement || !mainChip) continue

      const capInfos = group.decouplingCapChipIds
        .map((capChipId) => {
          const capChip = this.inputProblem.chipMap[capChipId]
          const strongMainPin = this.getStronglyConnectedMainPinId(
            capChipId,
            group.mainChipId,
          )
          const mainPin = strongMainPin
            ? this.inputProblem.chipPinMap[strongMainPin]
            : null
          return capChip && mainPin ? { capChipId, capChip, mainPin } : null
        })
        .filter((info) => info !== null)

      if (capInfos.length === 0) continue

      const side = this.getDominantSide(capInfos.map((info) => info.mainPin))
      const laneKey = `${group.mainChipId}:${side}`
      const laneIndex = laneCountByMainSide.get(laneKey) ?? 0
      laneCountByMainSide.set(laneKey, laneIndex + 1)

      const sortedCapInfos = capInfos.sort((a, b) =>
        side === "x-" || side === "x+"
          ? b.mainPin.offset.y - a.mainPin.offset.y
          : a.mainPin.offset.x - b.mainPin.offset.x,
      )

      const gap =
        this.inputProblem.decouplingCapsGap ?? this.inputProblem.chipGap
      const firstCap = sortedCapInfos[0]!.capChip
      const step =
        side === "x-" || side === "x+"
          ? firstCap.size.y + gap
          : firstCap.size.x + gap
      const pinCenters = sortedCapInfos.map((info) =>
        this.rotatePoint(info.mainPin.offset, mainPlacement.ccwRotationDegrees),
      )
      const desiredCenter =
        side === "x-" || side === "x+"
          ? pinCenters.reduce((sum, point) => sum + point.y, 0) /
            pinCenters.length
          : pinCenters.reduce((sum, point) => sum + point.x, 0) /
            pinCenters.length
      const start = desiredCenter + ((sortedCapInfos.length - 1) * step) / 2

      sortedCapInfos.forEach((info, index) => {
        const placement = finalLayout.chipPlacements[info.capChipId]
        if (!placement) return

        const laneOffset =
          laneIndex *
          ((side === "x-" || side === "x+"
            ? info.capChip.size.x
            : info.capChip.size.y) +
            gap)

        if (side === "x-" || side === "x+") {
          const mainHalfWidth = mainChip.size.x / 2
          const capHalfWidth = info.capChip.size.x / 2
          placement.x =
            mainPlacement.x +
            (side === "x-"
              ? -mainHalfWidth - capHalfWidth - gap - laneOffset
              : mainHalfWidth + capHalfWidth + gap + laneOffset)
          placement.y = mainPlacement.y + start - index * step
        } else {
          const mainHalfHeight = mainChip.size.y / 2
          const capHalfHeight = info.capChip.size.y / 2
          placement.x = mainPlacement.x + start - index * step
          placement.y =
            mainPlacement.y +
            (side === "y-"
              ? -mainHalfHeight - capHalfHeight - gap - laneOffset
              : mainHalfHeight + capHalfHeight + gap + laneOffset)
        }

        placement.ccwRotationDegrees = info.capChip.availableRotations?.[0] ?? 0
      })

      this.shiftDecouplingCapColumnAwayFromOverlaps({
        layout: finalLayout,
        capChipIds: sortedCapInfos.map((info) => info.capChipId),
        side,
        shiftStep:
          (side === "x-" || side === "x+" ? firstCap.size.x : firstCap.size.y) +
          gap,
      })
    }
  }

  private shiftDecouplingCapColumnAwayFromOverlaps({
    layout,
    capChipIds,
    side,
    shiftStep,
  }: {
    layout: OutputLayout
    capChipIds: string[]
    side: ChipPin["side"]
    shiftStep: number
  }) {
    const capChipIdSet = new Set(capChipIds)

    for (let attempt = 0; attempt < 20; attempt++) {
      const hasExternalOverlap = this.checkForOverlaps(layout).some(
        (overlap) =>
          capChipIdSet.has(overlap.chip1) !== capChipIdSet.has(overlap.chip2),
      )
      if (!hasExternalOverlap) return

      for (const capChipId of capChipIds) {
        const placement = layout.chipPlacements[capChipId]
        if (!placement) continue
        if (side === "x-") placement.x -= shiftStep
        else if (side === "x+") placement.x += shiftStep
        else if (side === "y-") placement.y -= shiftStep
        else placement.y += shiftStep
      }
    }
  }

  private getStronglyConnectedMainPinId(
    capChipId: string,
    mainChipId: string,
  ): PinId | null {
    for (const [connKey, connected] of Object.entries(
      this.inputProblem.pinStrongConnMap,
    )) {
      if (!connected) continue
      const [a, b] = connKey.split("-") as [PinId, PinId]
      const [aChipId] = a.split(".")
      const [bChipId] = b.split(".")
      if (aChipId === capChipId && bChipId === mainChipId) return b
      if (bChipId === capChipId && aChipId === mainChipId) return a
    }
    return null
  }

  private getDominantSide(pins: ChipPin[]): ChipPin["side"] {
    const counts = new Map<ChipPin["side"], number>()
    for (const pin of pins) {
      counts.set(pin.side, (counts.get(pin.side) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
  }

  private rotatePoint(
    point: { x: number; y: number },
    degrees: number,
  ): { x: number; y: number } {
    const normalized = ((degrees % 360) + 360) % 360
    if (normalized === 90) return { x: -point.y, y: point.x }
    if (normalized === 180) return { x: -point.x, y: -point.y }
    if (normalized === 270) return { x: point.y, y: -point.x }

    const angle = (normalized * Math.PI) / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    return {
      x: point.x * cos - point.y * sin,
      y: point.x * sin + point.y * cos,
    }
  }

  override visualize(): GraphicsObject {
    if (!this.solved && this.activeSubSolver)
      return this.activeSubSolver.visualize()

    // If the pipeline is complete and we have a partition packing solver,
    // show only the final chip placements
    if (this.solved && this.partitionPackingSolver?.solved) {
      return this.partitionPackingSolver.visualize()
    }

    const identifyDecouplingCapsViz =
      this.identifyDecouplingCapsSolver?.visualize()
    const chipPartitionsViz = this.chipPartitionsSolver?.visualize()
    const packInnerPartitionsViz = this.packInnerPartitionsSolver?.visualize()
    const partitionPackingViz = this.partitionPackingSolver?.visualize()

    // Get basic layout positions to avoid overlapping at (0,0)
    const basicLayout = doBasicInputProblemLayout(this.inputProblem)
    const inputViz = visualizeInputProblem(this.inputProblem, basicLayout)

    const visualizations = [
      inputViz,
      identifyDecouplingCapsViz,
      chipPartitionsViz,
      packInnerPartitionsViz,
      partitionPackingViz,
    ]
      .filter(Boolean)
      .map((viz, stepIndex) => {
        for (const rect of viz!.rects ?? []) {
          rect.step = stepIndex
        }
        for (const point of viz!.points ?? []) {
          point.step = stepIndex
        }
        for (const circle of viz!.circles ?? []) {
          circle.step = stepIndex
        }
        for (const text of viz!.texts ?? []) {
          text.step = stepIndex
        }
        for (const line of viz!.lines ?? []) {
          line.step = stepIndex
        }
        return viz
      }) as GraphicsObject[]

    if (visualizations.length === 1) return visualizations[0]!

    // Simple combination of visualizations
    return {
      points: visualizations.flatMap((v) => v.points || []),
      rects: visualizations.flatMap((v) => v.rects || []),
      lines: visualizations.flatMap((v) => v.lines || []),
      circles: visualizations.flatMap((v) => v.circles || []),
      texts: visualizations.flatMap((v) => v.texts || []),
    }
  }

  /**
   * A lightweight version of the visualize method that can be used to stream
   * progress
   */
  override preview(): GraphicsObject {
    if (this.activeSubSolver) {
      return this.activeSubSolver.preview()
    }

    // Show the most recent solver's output
    if (this.partitionPackingSolver?.solved) {
      return this.partitionPackingSolver.visualize()
    }
    if (this.packInnerPartitionsSolver?.solved) {
      return this.packInnerPartitionsSolver.visualize()
    }
    if (this.chipPartitionsSolver?.solved) {
      return this.chipPartitionsSolver.visualize()
    }
    if (this.identifyDecouplingCapsSolver?.solved) {
      return this.identifyDecouplingCapsSolver.visualize()
    }

    return super.preview()
  }

  /**
   * Checks if any chips are overlapping in the given layout, considering rotation.
   * Returns an array of overlapping chip pairs.
   */
  checkForOverlaps(layout: OutputLayout): Array<{
    chip1: string
    chip2: string
    overlapArea: number
  }> {
    const overlaps: Array<{
      chip1: string
      chip2: string
      overlapArea: number
    }> = []

    const chipIds = Object.keys(layout.chipPlacements)

    // Check each pair of chips for overlap
    for (let i = 0; i < chipIds.length; i++) {
      for (let j = i + 1; j < chipIds.length; j++) {
        const chip1Id = chipIds[i]!
        const chip2Id = chipIds[j]!
        const placement1 = layout.chipPlacements[chip1Id]!
        const placement2 = layout.chipPlacements[chip2Id]!

        // Get chip sizes from input problem
        const chip1 = this.inputProblem.chipMap[chip1Id]
        const chip2 = this.inputProblem.chipMap[chip2Id]

        if (!chip1 || !chip2) continue

        // Calculate rotated bounding boxes
        const bounds1 = this.getRotatedBounds(placement1, chip1.size)
        const bounds2 = this.getRotatedBounds(placement2, chip2.size)

        // Check for overlap
        const overlapArea = this.calculateOverlapArea(bounds1, bounds2)

        if (overlapArea > 0) {
          overlaps.push({
            chip1: chip1Id,
            chip2: chip2Id,
            overlapArea,
          })
        }
      }
    }

    return overlaps
  }

  /**
   * Calculate the axis-aligned bounding box for a rotated chip
   */
  private getRotatedBounds(
    placement: { x: number; y: number; ccwRotationDegrees: number },
    size: { x: number; y: number },
  ): {
    minX: number
    maxX: number
    minY: number
    maxY: number
  } {
    const halfWidth = size.x / 2
    const halfHeight = size.y / 2

    // For accurate overlap detection with rotation, calculate the axis-aligned bounding box
    // of the rotated rectangle
    const angleRad = (placement.ccwRotationDegrees * Math.PI) / 180
    const cos = Math.abs(Math.cos(angleRad))
    const sin = Math.abs(Math.sin(angleRad))

    // Rotated bounding box dimensions
    const rotatedWidth = halfWidth * cos + halfHeight * sin
    const rotatedHeight = halfWidth * sin + halfHeight * cos

    return {
      minX: placement.x - rotatedWidth,
      maxX: placement.x + rotatedWidth,
      minY: placement.y - rotatedHeight,
      maxY: placement.y + rotatedHeight,
    }
  }

  /**
   * Calculate the overlap area between two axis-aligned bounding boxes
   */
  private calculateOverlapArea(
    bounds1: {
      minX: number
      maxX: number
      minY: number
      maxY: number
    },
    bounds2: {
      minX: number
      maxX: number
      minY: number
      maxY: number
    },
  ): number {
    // Check if rectangles overlap
    if (
      bounds1.maxX <= bounds2.minX ||
      bounds1.minX >= bounds2.maxX ||
      bounds1.maxY <= bounds2.minY ||
      bounds1.minY >= bounds2.maxY
    ) {
      return 0 // No overlap
    }

    // Calculate overlap dimensions
    const overlapWidth =
      Math.min(bounds1.maxX, bounds2.maxX) -
      Math.max(bounds1.minX, bounds2.minX)
    const overlapHeight =
      Math.min(bounds1.maxY, bounds2.maxY) -
      Math.max(bounds1.minY, bounds2.minY)

    return overlapWidth * overlapHeight
  }

  getOutputLayout(): OutputLayout {
    if (!this.solved) {
      throw new Error(
        "Pipeline not solved yet. Call solve() or step() until solved.",
      )
    }

    let finalLayout: OutputLayout

    // Get the final layout from the partition packing solver
    if (
      this.partitionPackingSolver?.solved &&
      this.partitionPackingSolver.finalLayout
    ) {
      finalLayout = this.partitionPackingSolver.finalLayout
    } else {
      throw new Error(
        "No layout available. Pipeline may have failed or not progressed far enough.",
      )
    }

    // Check for overlaps in the final layout
    const overlaps = this.checkForOverlaps(finalLayout)
    if (overlaps.length > 0) {
      const overlapDetails = overlaps
        .map(
          (overlap) =>
            `${overlap.chip1} overlaps ${overlap.chip2} (area: ${overlap.overlapArea.toFixed(4)})`,
        )
        .join(", ")

      console.warn(
        `Warning: ${overlaps.length} chip overlaps detected in final layout: ${overlapDetails}`,
      )
    }

    return finalLayout
  }
}
