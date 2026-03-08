/**
 * Specialized layout solver for decoupling capacitors.
 * Positions decoupling capacitors close to their associated power pins on the main chip
 * for cleaner, more optimized layout.
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type {
  ChipId,
  InputProblem,
  NetId,
  PinId,
  Chip,
  PartitionInputProblem,
} from "lib/types/InputProblem"
import type { DecouplingCapGroup } from "../IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"

export interface DecouplingCapLayout {
  decouplingCapGroupId: string
  mainChipId: ChipId
  capPositions: Array<{
    chipId: ChipId
    x: number
    y: number
    rotation: number
    associatedPinId?: PinId
  }>
}

export class DecouplingCapsLayoutSolver extends BaseSolver {
  inputProblem: InputProblem | PartitionInputProblem
  decouplingCapGroups: DecouplingCapGroup[]
  outputLayouts: DecouplingCapLayout[] = []

  constructor(
    inputProblem: InputProblem | PartitionInputProblem,
    decouplingCapGroups: DecouplingCapGroup[],
  ) {
    super()
    this.inputProblem = inputProblem
    this.decouplingCapGroups = decouplingCapGroups
  }

  override _step() {
    this.outputLayouts = this.layoutDecouplingCaps()
    this.solved = true
  }

  private layoutDecouplingCaps(): DecouplingCapLayout[] {
    const layouts: DecouplingCapLayout[] = []

    for (const group of this.decouplingCapGroups) {
      const mainChip = this.inputProblem.chipMap[group.mainChipId]
      if (!mainChip) continue

      const capPositions: DecouplingCapLayout["capPositions"] = []
      
      // Find power pins on the main chip that connect to the decoupling cap nets
      const powerPinIds = this.findPowerPinIds(mainChip, group.netPair)
      
      // Position each decoupling capacitor near its associated power pin
      for (let i = 0; i < group.decouplingCapChipIds.length; i++) {
        const capChipId = group.decouplingCapChipIds[i]
        const capChip = this.inputProblem.chipMap[capChipId]
        if (!capChip) continue

        // Get the associated power pin (cycle through if more caps than pins)
        const associatedPinId = powerPinIds[i % powerPinIds.length]
        const associatedPin = mainChip.pins.find(p => p.pinId === associatedPinId)
        
        // Calculate position: place capacitor close to the power pin
        // Offset by a small distance to avoid overlap
        const offset = 0.5 // mm
        let x = mainChip.x + offset
        let y = mainChip.y + offset
        let rotation = 0

        if (associatedPin) {
          // Position relative to the pin location on the chip
          const pinCenter = associatedPin.center
          x = mainChip.x + pinCenter.x + offset
          y = mainChip.y + pinCenter.y + offset
          
          // Rotate capacitor to align with pin direction
          rotation = this.calculateOptimalRotation(associatedPin, capChip)
        }

        capPositions.push({
          chipId: capChipId,
          x,
          y,
          rotation,
          associatedPinId,
        })
      }

      layouts.push({
        decouplingCapGroupId: group.decouplingCapGroupId,
        mainChipId: group.mainChipId,
        capPositions,
      })
    }

    return layouts
  }

  private findPowerPinIds(chip: Chip, netPair: [NetId, NetId]): PinId[] {
    const powerPinIds: PinId[] = []
    
    for (const pin of chip.pins) {
      // Check if pin connects to either net in the pair
      if (pin.assignedNetId === netPair[0] || pin.assignedNetId === netPair[1]) {
        powerPinIds.push(pin.pinId)
      }
      
      // Also check strong connections
      if (pin.stronglyConnectedPinIds) {
        for (const connectedPinId of pin.stronglyConnectedPinIds) {
          const connectedPin = this.findPinById(connectedPinId)
          if (connectedPin && 
              (connectedPin.assignedNetId === netPair[0] || 
               connectedPin.assignedNetId === netPair[1])) {
            powerPinIds.push(pin.pinId)
            break
          }
        }
      }
    }
    
    return powerPinIds
  }

  private findPinById(pinId: PinId): Chip["pins"][0] | undefined {
    for (const chip of Object.values(this.inputProblem.chipMap)) {
      const pin = chip.pins.find(p => p.pinId === pinId)
      if (pin) return pin
    }
    return undefined
  }

  private calculateOptimalRotation(pin: Chip["pins"][0], capChip: Chip): number {
    // Determine rotation based on pin direction
    // Capacitors should face toward the power pin
    const pinCenter = pin.center
    
    // Simple heuristic: align capacitor perpendicular to chip edge
    if (Math.abs(pinCenter.x) > Math.abs(pinCenter.y)) {
      // Pin is on left/right side
      return pinCenter.x > 0 ? Math.PI : 0
    } else {
      // Pin is on top/bottom side
      return pinCenter.y > 0 ? Math.PI / 2 : (3 * Math.PI) / 2
    }
  }

  override getGraphics(): GraphicsObject[] {
    const graphics: GraphicsObject[] = []
    
    for (const layout of this.outputLayouts) {
      for (const capPos of layout.capPositions) {
        graphics.push({
          type: "rect",
          x: capPos.x - 0.3,
          y: capPos.y - 0.2,
          width: 0.6,
          height: 0.4,
          stroke: "green",
          strokeWidth: 0.05,
          rotation: capPos.rotation,
        })
        
        // Draw connection line to associated pin
        if (capPos.associatedPinId) {
          const mainChip = this.inputProblem.chipMap[layout.mainChipId]
          const pin = mainChip?.pins.find(p => p.pinId === capPos.associatedPinId)
          if (pin && mainChip) {
            graphics.push({
              type: "line",
              x1: capPos.x,
              y1: capPos.y,
              x2: mainChip.x + pin.center.x,
              y2: mainChip.y + pin.center.y,
              stroke: "green",
              strokeWidth: 0.02,
              strokeDasharray: "0.1 0.1",
            })
          }
        }
      }
    }
    
    return graphics
  }
}
