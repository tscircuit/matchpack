import { BaseSolver } from "../BaseSolver"
import type { InputProblem, ChipId, NetId, Chip } from "lib/types/InputProblem"
import type { DecouplingCapGroup } from "../IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import type { GraphicsObject } from "graphics-debug"

export class PlaceDecouplingCapsSolver extends BaseSolver {
  inputProblem: InputProblem
  decouplingCapGroups: DecouplingCapGroup[]

  constructor(params: {
    inputProblem: InputProblem
    decouplingCapGroups: DecouplingCapGroup[]
  }) {
    super()
    this.inputProblem = params.inputProblem
    this.decouplingCapGroups = params.decouplingCapGroups
  }

  override _step() {
    // Determine placement for each decoupling capacitor
    const GAP = 0.5
    // To avoid overlapping caps on the same pin, keep track of how many caps we've placed per pin
    const pinCapCount: Record<string, number> = {}

    for (const group of this.decouplingCapGroups) {
      const mainChip = this.inputProblem.chipMap[group.mainChipId]
      if (!mainChip) continue

      // Set the main chip to be fixed at 0,0 if it isn't already fixed
      if (!mainChip.fixedPosition) {
        mainChip.fixedPosition = { x: 0, y: 0 }
      }

      for (const capId of group.decouplingCapChipIds) {
        const cap = this.inputProblem.chipMap[capId]
        if (!cap) continue

        // Find the pin on the main chip that this cap is strongly connected to
        let connectedPinOnMainChip: string | null = null

        for (const capPinId of cap.pins) {
          for (const [connKey, isConnected] of Object.entries(
            this.inputProblem.pinStrongConnMap,
          )) {
            if (!isConnected) continue
            const [p1, p2] = connKey.split("-")
            if (p1 === capPinId && p2?.startsWith(`${group.mainChipId}.`)) {
              connectedPinOnMainChip = p2
              break
            }
            if (p2 === capPinId && p1?.startsWith(`${group.mainChipId}.`)) {
              connectedPinOnMainChip = p1
              break
            }
          }
          if (connectedPinOnMainChip) break
        }

        if (connectedPinOnMainChip) {
          const mainPin = this.inputProblem.chipPinMap[connectedPinOnMainChip]
          if (mainPin) {
            const side = mainPin.side
            const offset = mainPin.offset
            const mainChipPos = mainChip.fixedPosition

            pinCapCount[connectedPinOnMainChip] =
              (pinCapCount[connectedPinOnMainChip] || 0) + 1
            const count = pinCapCount[connectedPinOnMainChip]!
            const shift = (count - 1) * (Math.max(cap.size.x, cap.size.y) + 0.2)

            let capX = mainChipPos.x + offset.x
            let capY = mainChipPos.y + offset.y
            let rotation = 0

            if (side === "x-") {
              capX -= cap.size.x / 2 + GAP
              capY += shift
            } else if (side === "x+") {
              capX += cap.size.x / 2 + GAP
              capY += shift
            } else if (side === "y+") {
              capY += cap.size.y / 2 + GAP
              capX += shift
              rotation = 90
            } else if (side === "y-") {
              capY -= cap.size.y / 2 + GAP
              capX += shift
              rotation = 90
            }

            cap.fixedPosition = { x: capX, y: capY }
            if (!cap.availableRotations) {
              cap.availableRotations = [rotation as any]
            } else {
              cap.availableRotations = [rotation as any]
            }
          }
        }
      }
    }

    this.solved = true
  }

  override visualize(): GraphicsObject {
    return {
      points: [],
      rects: [],
      lines: [],
      circles: [],
      texts: [],
    }
  }

  override getConstructorParams() {
    return [
      {
        inputProblem: this.inputProblem,
        decouplingCapGroups: this.decouplingCapGroups,
      },
    ]
  }
}
