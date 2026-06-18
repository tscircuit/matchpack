import { BaseSolver } from "../BaseSolver"
import type { OutputLayout } from "../../types/OutputLayout"

/**
 * OverlapResolutionSolver nudges overlapping chips apart for clarity.
 */
export class OverlapResolutionSolver extends BaseSolver {
  inputLayout: OutputLayout
  chipMap?: Record<string, { size: { x: number; y: number } }>
  outputLayout: OutputLayout | null = null
  override solved = false

  constructor(
    inputLayout: OutputLayout,
    chipMap?: Record<string, { size: { x: number; y: number } }>,
  ) {
    super()
    // Deep copy placements to avoid mutation
    this.inputLayout = {
      ...inputLayout,
      chipPlacements: JSON.parse(JSON.stringify(inputLayout.chipPlacements)),
    }
    this.chipMap = chipMap
  }

  // Helper to get rotated bounding box (same as pipeline)
  getRotatedBounds(
    placement: { x: number; y: number; ccwRotationDegrees: number },
    size: { x: number; y: number },
  ) {
    const halfWidth = size.x / 2
    const halfHeight = size.y / 2
    const angleRad = (placement.ccwRotationDegrees * Math.PI) / 180
    const cos = Math.abs(Math.cos(angleRad))
    const sin = Math.abs(Math.sin(angleRad))
    const rotatedWidth = halfWidth * cos + halfHeight * sin
    const rotatedHeight = halfWidth * sin + halfHeight * cos
    return {
      minX: placement.x - rotatedWidth,
      maxX: placement.x + rotatedWidth,
      minY: placement.y - rotatedHeight,
      maxY: placement.y + rotatedHeight,
    }
  }

  // Helper to check overlap area (same as pipeline)
  calculateOverlapArea(
    bounds1: { minX: number; maxX: number; minY: number; maxY: number },
    bounds2: { minX: number; maxX: number; minY: number; maxY: number },
  ) {
    if (
      bounds1.maxX <= bounds2.minX ||
      bounds1.minX >= bounds2.maxX ||
      bounds1.maxY <= bounds2.minY ||
      bounds1.minY >= bounds2.maxY
    ) {
      return 0
    }
    const overlapWidth =
      Math.min(bounds1.maxX, bounds2.maxX) -
      Math.max(bounds1.minX, bounds2.minX)
    const overlapHeight =
      Math.min(bounds1.maxY, bounds2.maxY) -
      Math.max(bounds1.minY, bounds2.minY)
    return overlapWidth * overlapHeight
  }

  override _step() {
    // Deep clone placements to avoid mutation
    const placements: typeof this.inputLayout.chipPlacements = JSON.parse(
      JSON.stringify(this.inputLayout.chipPlacements),
    )
    const chipIds = Object.keys(placements).filter(
      (id): id is string => typeof id === "string" && !!placements[id],
    )
    const minGap = 0.2
    let maxIterations = 500
    let iteration = 0
    let moved = false

    // Main resolution loop
    do {
      moved = false
      for (let i = 0; i < chipIds.length; i++) {
        for (let j = i + 1; j < chipIds.length; j++) {
          const chipIdA = chipIds[i]
          const chipIdB = chipIds[j]
          if (!chipIdA || !chipIdB) continue
          const a = placements[chipIdA]
          const b = placements[chipIdB]
          if (!a || !b) continue
          const sizeA = this.chipMap?.[chipIdA]?.size || { x: 2, y: 2 }
          const sizeB = this.chipMap?.[chipIdB]?.size || { x: 2, y: 2 }

          const boundsA = this.getRotatedBounds(a, sizeA)
          const boundsB = this.getRotatedBounds(b, sizeB)
          const overlapArea = this.calculateOverlapArea(boundsA, boundsB)

          if (overlapArea > 0) {
            let dx = a.x - b.x
            let dy = a.y - b.y
            let dist = Math.sqrt(dx * dx + dy * dy)
            if (dist === 0) {
              dx = (Math.random() - 0.5) * 0.1
              dy = (Math.random() - 0.5) * 0.1
              dist = Math.sqrt(dx * dx + dy * dy)
            }
            const push =
              ((sizeA.x + sizeB.x) / 2 +
                minGap -
                dist +
                Math.sqrt(overlapArea)) /
              2
            a.x += (dx / dist) * push
            b.x -= (dx / dist) * push
            a.y += (dy / dist) * push
            b.y -= (dy / dist) * push
            moved = true
          }
        }
      }
      iteration++
    } while (moved && iteration < maxIterations)

    // Check for unresolved overlaps
    let unresolvedOverlaps = 0
    for (let i = 0; i < chipIds.length; i++) {
      for (let j = i + 1; j < chipIds.length; j++) {
        const chipIdA = chipIds[i]
        const chipIdB = chipIds[j]
        if (!chipIdA || !chipIdB) continue
        const a = placements[chipIdA]
        const b = placements[chipIdB]
        if (!a || !b) continue
        const sizeA = this.chipMap?.[chipIdA]?.size || { x: 2, y: 2 }
        const sizeB = this.chipMap?.[chipIdB]?.size || { x: 2, y: 2 }
        const boundsA = this.getRotatedBounds(a, sizeA)
        const boundsB = this.getRotatedBounds(b, sizeB)
        const overlapArea = this.calculateOverlapArea(boundsA, boundsB)
        if (overlapArea > 0) unresolvedOverlaps++
      }
    }

    // Aggressive fallback: scatter and rerun resolution if needed
    let scatterAttempts = 0
    const maxScatterAttempts = 5
    while (unresolvedOverlaps > 0 && scatterAttempts < maxScatterAttempts) {
      // Scatter chips randomly within a larger radius
      for (let i = 0; i < chipIds.length; i++) {
        const chipId = chipIds[i]
        if (typeof chipId === "string") {
          const chip = placements[chipId]
          if (chip) {
            chip.x += (Math.random() - 0.5) * 2
            chip.y += (Math.random() - 0.5) * 2
          }
        }
      }
      // Rerun resolution loop
      iteration = 0
      do {
        moved = false
        for (let i = 0; i < chipIds.length; i++) {
          for (let j = i + 1; j < chipIds.length; j++) {
            const chipIdA = chipIds[i]
            const chipIdB = chipIds[j]
            if (!chipIdA || !chipIdB) continue
            const a = placements[chipIdA]
            const b = placements[chipIdB]
            if (!a || !b) continue
            const sizeA = this.chipMap?.[chipIdA]?.size || { x: 2, y: 2 }
            const sizeB = this.chipMap?.[chipIdB]?.size || { x: 2, y: 2 }
            const boundsA = this.getRotatedBounds(a, sizeA)
            const boundsB = this.getRotatedBounds(b, sizeB)
            const overlapArea = this.calculateOverlapArea(boundsA, boundsB)
            if (overlapArea > 0) {
              let dx = a.x - b.x
              let dy = a.y - b.y
              let dist = Math.sqrt(dx * dx + dy * dy)
              if (dist === 0) {
                dx = (Math.random() - 0.5) * 0.1
                dy = (Math.random() - 0.5) * 0.1
                dist = Math.sqrt(dx * dx + dy * dy)
              }
              const push =
                ((sizeA.x + sizeB.x) / 2 +
                  minGap -
                  dist +
                  Math.sqrt(overlapArea)) /
                2
              a.x += (dx / dist) * push
              b.x -= (dx / dist) * push
              a.y += (dy / dist) * push
              b.y -= (dy / dist) * push
              moved = true
            }
          }
        }
        iteration++
      } while (moved && iteration < maxIterations)
      // Check for remaining overlaps
      unresolvedOverlaps = 0
      for (let i = 0; i < chipIds.length; i++) {
        for (let j = i + 1; j < chipIds.length; j++) {
          const chipIdA = chipIds[i]
          const chipIdB = chipIds[j]
          if (!chipIdA || !chipIdB) continue
          const a = placements[chipIdA]
          const b = placements[chipIdB]
          if (!a || !b) continue
          const sizeA = this.chipMap?.[chipIdA]?.size || { x: 2, y: 2 }
          const sizeB = this.chipMap?.[chipIdB]?.size || { x: 2, y: 2 }
          const boundsA = this.getRotatedBounds(a, sizeA)
          const boundsB = this.getRotatedBounds(b, sizeB)
          const overlapArea = this.calculateOverlapArea(boundsA, boundsB)
          if (overlapArea > 0) unresolvedOverlaps++
        }
      }
      scatterAttempts++
    }
    if (unresolvedOverlaps > 0) {
      throw new Error("Could not resolve all overlaps")
    }

    this.outputLayout = {
      ...this.inputLayout,
      chipPlacements: placements,
    }
    this.solved = true
  }

  getOutputLayout(): OutputLayout | null {
    return this.outputLayout
  }
}
