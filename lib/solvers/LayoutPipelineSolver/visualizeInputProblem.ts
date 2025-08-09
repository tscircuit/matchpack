import type { GraphicsObject } from "graphics-debug"
import type { InputProblem, PinId, NetId } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import type { Point } from "@tscircuit/math-utils"

/**
 * Rotate a point around the origin by the given angle (counterclockwise)
 */
function rotatePoint(point: Point, angleDegrees: number): Point {
  const angleRad = (angleDegrees * Math.PI) / 180
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }
}

/**
 * Get rotated dimensions for a chip based on its rotation
 */
function getRotatedDimensions(width: number, height: number, rotation: number): { width: number; height: number } {
  const normalizedRotation = ((rotation % 360) + 360) % 360
  if (normalizedRotation === 90 || normalizedRotation === 270) {
    return { width: height, height: width }
  }
  return { width, height }
}

/**
 * Build a simple visualization of the raw input problem: chips, pins, and
 * connectivity (both net-group connections and direct pin-to-pin connections).
 */
export function visualizeInputProblem(
  inputProblem: InputProblem,
  basicLayout: OutputLayout,
): GraphicsObject {
  const inputViz: GraphicsObject = {
    points: [],
    rects: [],
    lines: [],
    circles: [],
    texts: [],
  }

  // Build pin-to-net mapping first so it's available when creating pin labels
  const pinToNetMap: Record<PinId, NetId> = {}
  for (const conn of Object.keys(inputProblem.netConnMap)) {
    const [pinId, netId] = conn.split("-") as [PinId, NetId]
    pinToNetMap[pinId] = netId
  }

  for (const [chipId, chip] of Object.entries(inputProblem.chipMap)) {
    const chipPins = chip.pins.map((p) => inputProblem.chipPinMap[p]!)
    const placement = basicLayout.chipPlacements[chipId]

    if (!placement) continue
    // Use chip.size if available, otherwise calculate from pin positions
    let width: number
    let height: number
    if (
      chip.size &&
      Number.isFinite((chip.size as any).x) &&
      Number.isFinite((chip.size as any).y)
    ) {
      width = chip.size.x
      height = chip.size.y
    } else {
      // Compute a simple bounding box around pin offsets with a small margin
      const xs = chipPins.map((p) => p.offset.x)
      const ys = chipPins.map((p) => p.offset.y)
      const minX = xs.length ? Math.min(...xs) : -5
      const maxX = xs.length ? Math.max(...xs) : 5
      const minY = ys.length ? Math.min(...ys) : -5
      const maxY = ys.length ? Math.max(...ys) : 5
      width = Math.max(10, maxX - minX + 6)
      height = Math.max(10, maxY - minY + 6)
    }

    // Position chip at its placement location
    const chipCenterX = placement.x
    const chipCenterY = placement.y
    
    // Get rotated dimensions for the chip rectangle
    const rotatedDims = getRotatedDimensions(width, height, placement.ccwRotationDegrees)

    inputViz.rects!.push({
      center: { x: chipCenterX, y: chipCenterY },
      width: rotatedDims.width,
      height: rotatedDims.height,
      label: chipId,
    })

    // Also draw a text label for compatibility with tests
    inputViz.texts!.push({ x: chipCenterX, y: chipCenterY, text: chipId })

    for (const pin of chipPins) {
      // Rotate pin offset around chip center based on chip rotation
      const rotatedOffset = rotatePoint(pin.offset, placement.ccwRotationDegrees)
      const pinAbsX = placement.x + rotatedOffset.x
      const pinAbsY = placement.y + rotatedOffset.y
      const netId = pinToNetMap[pin.pinId]
      const label = netId ? `${pin.pinId} (${netId})` : pin.pinId
      inputViz.points!.push({
        x: pinAbsX,
        y: pinAbsY,
        label: label,
      })
    }
  }

  const netToPins: Record<NetId, PinId[]> = {}
  for (const [pinId, netId] of Object.entries(pinToNetMap)) {
    if (!netToPins[netId]) netToPins[netId] = []
    netToPins[netId]!.push(pinId)
  }

  for (const [, pinIds] of Object.entries(netToPins)) {
    const pinPositions = pinIds
      .map((pinId) => {
        const chipPin = inputProblem.chipPinMap[pinId]
        if (chipPin) {
          // Find which chip this pin belongs to
          for (const [chipId, chip] of Object.entries(inputProblem.chipMap)) {
            if (chip.pins.includes(pinId)) {
              const placement = basicLayout.chipPlacements[chipId]
              if (placement) {
                // Rotate pin offset around chip center based on chip rotation
                const rotatedOffset = rotatePoint(chipPin.offset, placement.ccwRotationDegrees)
                return {
                  x: placement.x + rotatedOffset.x,
                  y: placement.y + rotatedOffset.y,
                }
              }
            }
          }
          return chipPin.offset
        }
        const groupPin = inputProblem.groupPinMap[pinId]
        if (groupPin) return groupPin.offset
        return null
      })
      .filter(Boolean) as Point[]

    for (let i = 0; i < pinPositions.length; i++) {
      for (let j = i + 1; j < pinPositions.length; j++) {
        inputViz.lines!.push({
          points: [pinPositions[i]!, pinPositions[j]!],
          strokeColor: "rgba(0,0,0,0.1)",
        })
      }
    }
  }

  // Draw direct pin-to-pin ("strong") connections
  const getAbsolutePositionForPin = (pinId: PinId): Point | null => {
    const chipPin = inputProblem.chipPinMap[pinId]
    if (chipPin) {
      for (const [chipId, chip] of Object.entries(inputProblem.chipMap)) {
        if (chip.pins.includes(pinId)) {
          const placement = basicLayout.chipPlacements[chipId]
          if (placement) {
            return {
              x: placement.x + chipPin.offset.x,
              y: placement.y + chipPin.offset.y,
            }
          }
        }
      }
      return chipPin.offset
    }
    const groupPin = inputProblem.groupPinMap[pinId]
    if (groupPin) return groupPin.offset
    return null
  }

  const seenStrongConn = new Set<string>()
  for (const [connKey, connected] of Object.entries(
    inputProblem.pinStrongConnMap,
  )) {
    if (!connected) continue
    const [pinA, pinB] = connKey.split("-") as [PinId, PinId]
    const uniqueKey = pinA < pinB ? `${pinA}-${pinB}` : `${pinB}-${pinA}`
    if (seenStrongConn.has(uniqueKey)) continue
    seenStrongConn.add(uniqueKey)

    const p1 = getAbsolutePositionForPin(pinA)
    const p2 = getAbsolutePositionForPin(pinB)
    if (!p1 || !p2) continue

    inputViz.lines!.push({
      points: [p1, p2],
      // Slightly darker to distinguish from net-group lines
      // strokeColor: "rgba(0,0,0,0.6)",
    })
  }

  return inputViz
}
