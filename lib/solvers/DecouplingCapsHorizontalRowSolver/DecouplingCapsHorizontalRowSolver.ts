import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type { ChipId, PartitionInputProblem } from "../../types/InputProblem"

/**
 * Shape returned to the parent SingleInnerPartitionPackingSolver — must
 * be assignment-compatible with `PackSolver2["packedComponents"]` so the
 * existing layout-extraction code at the call site keeps working.
 */
export type PackedComponent = {
  componentId: string
  center: { x: number; y: number }
  ccwRotationOffset?: number
  ccwRotationDegrees?: number
}

/**
 * Specialized packer for partitions of decoupling capacitors.
 *
 * Why this exists
 * ---------------
 * The general-purpose `PackSolver2` arranges decoupling caps using the
 * same minimum-distance heuristics it uses for arbitrary chips. That
 * tends to leave them scattered or stacked in a bounding box that's
 * convenient for the packer but ugly for a human reader. The
 * acceptable layout shown in tscircuit/matchpack#15 is a single tidy
 * row: all caps share a y-axis, sit at consistent x intervals, and the
 * row is later attached next to the main chip's power pins by the
 * outer `PartitionPackingSolver`.
 *
 * Algorithm
 * ---------
 * 1. Pull the cap chips out of the partition. Sort by chipId so the row
 *    order is deterministic across runs (important for snapshot
 *    stability and for the outer packer's nearest-neighbor logic).
 * 2. Stretch them along the x-axis with `gap` separation between
 *    adjacent cap edges, centering the whole row on the origin so the
 *    outer packer treats the partition as a single rectangular block.
 * 3. Apply each cap's first available rotation (typically 0°) — the
 *    `IdentifyDecouplingCapsSolver` already restricts caps to
 *    rotations that keep the y+/y- pin pair upright, so we don't need
 *    to choose between options.
 *
 * The solver completes in a single `_step()` — there's nothing
 * iterative to do — but it conforms to the BaseSolver / PackSolver2
 * shape so the caller can treat it interchangeably.
 */
export class DecouplingCapsHorizontalRowSolver extends BaseSolver {
  partitionInputProblem: PartitionInputProblem
  gap: number
  packedComponents: PackedComponent[] = []

  constructor(params: {
    partitionInputProblem: PartitionInputProblem
    /**
     * Gap between adjacent cap edges. If unset we fall back to the
     * partition's `decouplingCapsGap`, then `chipGap`. Mirrors the
     * existing fallback chain in SingleInnerPartitionPackingSolver.
     */
    gap?: number
  }) {
    super()
    this.partitionInputProblem = params.partitionInputProblem
    this.gap =
      params.gap ??
      this.partitionInputProblem.decouplingCapsGap ??
      this.partitionInputProblem.chipGap
  }

  override getConstructorParams(): [
    { partitionInputProblem: PartitionInputProblem; gap?: number },
  ] {
    return [
      { partitionInputProblem: this.partitionInputProblem, gap: this.gap },
    ]
  }

  override _step() {
    const chips = Object.values(this.partitionInputProblem.chipMap)

    if (chips.length === 0) {
      this.packedComponents = []
      this.solved = true
      return
    }

    // Sort by chipId for deterministic ordering. If there's exactly one
    // cap (degenerate partition) we still go through the same path —
    // the row "of one" lands centered on the origin.
    const ordered = [...chips].sort((a, b) => a.chipId.localeCompare(b.chipId))

    // Compute total row width: sum of cap widths + (n-1) gaps. Then
    // walk from the left edge placing each cap so that the row is
    // centered on x=0 / y=0.
    const totalWidth =
      ordered.reduce((sum, chip) => sum + chip.size.x, 0) +
      Math.max(0, ordered.length - 1) * this.gap

    let cursor = -totalWidth / 2

    const packed: PackedComponent[] = []
    for (const chip of ordered) {
      const halfWidth = chip.size.x / 2
      const rotation = pickRotation(chip.availableRotations)
      packed.push({
        componentId: chip.chipId,
        center: { x: cursor + halfWidth, y: 0 },
        ccwRotationDegrees: rotation,
        ccwRotationOffset: rotation,
      })
      cursor += chip.size.x + this.gap
    }

    this.packedComponents = packed
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return {
      lines: [],
      points: [],
      circles: [],
      rects: this.packedComponents.map((pc) => {
        const chip = this.partitionInputProblem.chipMap[pc.componentId]!
        return {
          center: pc.center,
          width: chip.size.x,
          height: chip.size.y,
          fill: "rgba(120,180,255,0.35)",
          stroke: "rgba(40,90,180,0.8)",
          label: chip.chipId,
        }
      }),
    }
  }
}

/**
 * Decoupling caps come in with `availableRotations: [0]` from
 * `IdentifyDecouplingCapsSolver`, but the field is also optional —
 * default to 0 so we never hand back undefined.
 */
function pickRotation(
  available: ReadonlyArray<0 | 90 | 180 | 270> | undefined,
): 0 | 90 | 180 | 270 {
  if (!available || available.length === 0) return 0
  return available[0]!
}

export type { ChipId }
