/**
 * Example: Specialized Layout for Decoupling Capacitors
 *
 * This example demonstrates how to use the decoupling capacitor layout
 * algorithm to transform a messy scattered placement (issue #15) into
 * a clean organized grid.
 *
 * Before: Caps scattered around the board
 * After:  Caps in a tight grid directly below each IC
 */

import {
  applyDecouplingCapacitorLayout,
  groupDecouplingCapacitorsByIC,
  type DecouplingCapacitorGroup,
} from "../src/layouts"

// ─── Example: Single IC with 8 decoupling caps ───────────────────────────────

const singleIcGroup: DecouplingCapacitorGroup = {
  icId: "U1",
  icBounds: {
    center: { x: 10, y: 10 },
    width: 8,  // mm
    height: 8, // mm
  },
  capacitorIds: ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"],
}

const placements = applyDecouplingCapacitorLayout([singleIcGroup], {
  capsPerRow: 4,
  capWidth: 0.6,
  capHeight: 0.3,
  capSpacing: 0.5,
  offsetFromIC: 0.8,
  placementSide: "bottom",
})

console.log("Decoupling capacitor positions (mm):")
console.log("IC U1 center: (10, 10), size: 8mm × 8mm")
console.log("")

for (const [id, pos] of placements) {
  console.log(
    `  ${id}: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}, rot=${pos.rotation}°`,
  )
}

// Expected output (2 rows of 4 caps below U1):
//   C1: x=8.35, y=5.85, rot=0°
//   C2: x=8.95, y=5.85, rot=0°
//   C3: x=9.55, y=5.85, rot=0°  (approx, depends on exact spacing)
//   C4: x=10.15, y=5.85, rot=0°
//   C5: x=8.35, y=5.55, rot=0°
//   C6: x=8.95, y=5.55, rot=0°
//   C7: x=9.55, y=5.55, rot=0°
//   C8: x=10.15, y=5.55, rot=0°

// ─── Example: Multiple ICs ────────────────────────────────────────────────────

const multipleIcGroups: DecouplingCapacitorGroup[] = [
  {
    icId: "U1",
    icBounds: { center: { x: 0, y: 0 }, width: 8, height: 8 },
    capacitorIds: ["C1", "C2", "C3", "C4"],
  },
  {
    icId: "U2",
    icBounds: { center: { x: 25, y: 0 }, width: 10, height: 10 },
    capacitorIds: ["C5", "C6", "C7", "C8", "C9", "C10"],
  },
  {
    icId: "U3",
    icBounds: { center: { x: 50, y: 0 }, width: 6, height: 6 },
    capacitorIds: ["C11", "C12"],
  },
]

const allPlacements = applyDecouplingCapacitorLayout(multipleIcGroups, {
  capsPerRow: 4,
  capWidth: 0.6,
  capHeight: 0.3,
  capSpacing: 0.5,
  offsetFromIC: 0.8,
  placementSide: "bottom",
})

console.log("\nMultiple IC layout:")
for (const [id, pos] of allPlacements) {
  console.log(
    `  ${id}: x=${pos.x.toFixed(2)}, y=${pos.y.toFixed(2)}`,
  )
}

// ─── Example: Using groupDecouplingCapacitorsByIC ─────────────────────────────

const schematicComponents = [
  { id: "U1", name: "U1", type: "chip", ftype: "simple_chip" },
  {
    id: "C1",
    name: "C1",
    type: "simple_capacitor",
    ftype: "simple_capacitor",
    value: "100nF",
  },
  {
    id: "C2",
    name: "C2",
    type: "simple_capacitor",
    ftype: "simple_capacitor",
    value: "10uF",
  },
]

const netlist = [
  { netId: "vcc", netName: "VCC", componentIds: ["U1", "C1", "C2"] },
  { netId: "gnd", netName: "GND", componentIds: ["U1", "C1", "C2"] },
]

const autoGroups = groupDecouplingCapacitorsByIC(schematicComponents, netlist)
console.log("\nAuto-grouped decoupling capacitors:")
for (const group of autoGroups) {
  console.log(`  IC ${group.icId}: caps = [${group.capacitorIds.join(", ")}]`)
}
