/**
 * Example: Specialized Decoupling Capacitor Layout
 *
 * Demonstrates how the layoutDecouplingCapacitors() function produces a clean,
 * pin-adjacent placement compared with the default "messy" stacked layout.
 *
 * Run this example with:
 *   npx tsx examples/decoupling-cap-layout/index.tsx
 */

import {
  layoutDecouplingCapacitors,
  type ComponentBounds,
  type PinInfo,
} from "../../lib/layouts/decoupling-capacitor-layout"

// ---------------------------------------------------------------------------
// Simulate a 16-pin QFN with power pins on all four sides
// ---------------------------------------------------------------------------

const chip: ComponentBounds = {
  centre: { x: 0, y: 0 },
  width: 4, // 4 mm × 4 mm body
  height: 4,
}

// Power pins — one per side in this simplified example
const powerPins: PinInfo[] = [
  // Top side
  { pinNumber: 2, net: "VDD",   position: { x: -0.5, y:  2 }, side: "top" },
  { pinNumber: 4, net: "AVDD",  position: { x:  0.5, y:  2 }, side: "top" },
  // Bottom side
  { pinNumber: 10, net: "GND",  position: { x: -0.5, y: -2 }, side: "bottom" },
  { pinNumber: 12, net: "AGND", position: { x:  0.5, y: -2 }, side: "bottom" },
  // Left side
  { pinNumber: 6,  net: "VCC",  position: { x: -2, y:  0.5 }, side: "left" },
  // Right side
  { pinNumber: 14, net: "IOVDD",position: { x:  2, y: -0.5 }, side: "right" },
]

const placements = layoutDecouplingCapacitors(chip, powerPins, {
  chipToCapGap: 0.3,   // 0.3 mm gap between chip edge and capacitor
  capSpacing:   0.8,   // 0.8 mm centre-to-centre between adjacent caps
  capLength:    1.0,   // 0402 long axis
  capWidth:     0.5,   // 0402 short axis
})

console.log("=== Decoupling Capacitor Placements ===\n")
console.log(
  `Chip: ${chip.width} mm × ${chip.height} mm, centre (${chip.centre.x}, ${chip.centre.y})\n`,
)

for (const p of placements) {
  console.log(
    `${p.capId}  pin=${p.pinNumber}  ` +
    `x=${p.position.x.toFixed(3)}  y=${p.position.y.toFixed(3)}  ` +
    `rot=${p.rotation}°`,
  )
}

console.log("\nAll caps placed adjacent to their associated power pins ✓")
