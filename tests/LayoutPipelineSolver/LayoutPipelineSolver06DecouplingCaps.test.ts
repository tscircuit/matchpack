import { test, expect } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"

// Problem data from LayoutPipelineSolver06.page.tsx
const problem: InputProblem = {
  chipMap: {
    U3: {
      chipId: "U3",
      pins: [
        "U3.1", "U3.2", "U3.3", "U3.4", "U3.5", "U3.6", "U3.7", "U3.8", "U3.9", "U3.10",
        "U3.11", "U3.12", "U3.13", "U3.14", "U3.15", "U3.16", "U3.17", "U3.18", "U3.19", "U3.20",
        "U3.21", "U3.22", "U3.23", "U3.24", "U3.25", "U3.26", "U3.27", "U3.28", "U3.29", "U3.30",
        "U3.31", "U3.32", "U3.33", "U3.34", "U3.35", "U3.36", "U3.37", "U3.38", "U3.39", "U3.40",
        "U3.41", "U3.42", "U3.43", "U3.44", "U3.45", "U3.46", "U3.47", "U3.48", "U3.49", "U3.50",
        "U3.51", "U3.52", "U3.53", "U3.54", "U3.55", "U3.56", "U3.57"
      ],
      size: { x: 3, y: 8.400000000000004 },
      availableRotations: [0, 90, 180, 270],
    },
    C12: { chipId: "C12", pins: ["C12.1", "C12.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0] },
    C14: { chipId: "C14", pins: ["C14.1", "C14.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0] },
    C8: { chipId: "C8", pins: ["C8.1", "C8.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0] },
    C13: { chipId: "C13", pins: ["C13.1", "C13.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0] },
    C15: { chipId: "C15", pins: ["C15.1", "C15.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0] },
    C19: { chipId: "C19", pins: ["C19.1", "C19.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0] },
    C18: { chipId: "C18", pins: ["C18.1", "C18.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0] },
    C7: { chipId: "C7", pins: ["C7.1", "C7.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0] },
    C9: { chipId: "C9", pins: ["C9.1", "C9.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0] },
    C10: { chipId: "C10", pins: ["C10.1", "C10.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0] },
    C11: { chipId: "C11", pins: ["C11.1", "C11.2"], size: { x: 0.53, y: 1.06 }, availableRotations: [0] },
  },
  chipPinMap: {
    // U3 pins - simplified to x- and x+ sides
    "U3.1": { pinId: "U3.1", offset: { x: -1.9, y: 1.2000000000000015 }, side: "x-" },
    "U3.2": { pinId: "U3.2", offset: { x: -1.9, y: -1.8000000000000007 }, side: "x-" },
    "U3.10": { pinId: "U3.10", offset: { x: -1.9, y: 1.0000000000000013 }, side: "x-" },
    "U3.22": { pinId: "U3.22", offset: { x: -1.9, y: 0.8000000000000012 }, side: "x-" },
    "U3.23": { pinId: "U3.23", offset: { x: -1.9, y: 2.8000000000000016 }, side: "x-" },
    "U3.33": { pinId: "U3.33", offset: { x: -1.9, y: 0.600000000000001 }, side: "x-" },
    "U3.42": { pinId: "U3.42", offset: { x: -1.9, y: 0.4000000000000008 }, side: "x-" },
    "U3.43": { pinId: "U3.43", offset: { x: -1.9, y: -1.6000000000000005 }, side: "x-" },
    "U3.44": { pinId: "U3.44", offset: { x: -1.9, y: 2.0000000000000018 }, side: "x-" },
    "U3.49": { pinId: "U3.49", offset: { x: -1.9, y: 0.20000000000000062 }, side: "x-" },
    "U3.50": { pinId: "U3.50", offset: { x: -1.9, y: 2.600000000000002 }, side: "x-" },
    // Capacitor pins - y+ and y- sides
    "C7.1": { pinId: "C7.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C7.2": { pinId: "C7.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C8.1": { pinId: "C8.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C8.2": { pinId: "C8.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C9.1": { pinId: "C9.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C9.2": { pinId: "C9.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C10.1": { pinId: "C10.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C10.2": { pinId: "C10.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C11.1": { pinId: "C11.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C11.2": { pinId: "C11.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C12.1": { pinId: "C12.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C12.2": { pinId: "C12.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C13.1": { pinId: "C13.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C13.2": { pinId: "C13.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C14.1": { pinId: "C14.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C14.2": { pinId: "C14.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C15.1": { pinId: "C15.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C15.2": { pinId: "C15.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C18.1": { pinId: "C18.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C18.2": { pinId: "C18.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C19.1": { pinId: "C19.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C19.2": { pinId: "C19.2", offset: { x: 0, y: -0.55 }, side: "y-" },
  },
  netMap: {
    V3_3: { netId: "V3_3", isPositiveVoltageSource: true },
    V1_1: { netId: "V1_1", isPositiveVoltageSource: true },
    GND: { netId: "GND", isGround: true },
  },
  pinStrongConnMap: {
    "U3.1-C12.1": true, "C12.1-U3.1": true,
    "U3.10-C14.1": true, "C14.1-U3.10": true,
    "U3.22-C8.1": true, "C8.1-U3.22": true,
    "U3.33-C13.1": true, "C13.1-U3.33": true,
    "U3.42-C15.1": true, "C15.1-U3.42": true,
    "U3.49-C19.1": true, "C19.1-U3.49": true,
    "U3.23-C18.1": true, "C18.1-U3.23": true,
    "U3.50-C7.1": true, "C7.1-U3.50": true,
    "C11.1-U3.43": true, "U3.43-C11.1": true,
    "C10.1-U3.44": true, "U3.44-C10.1": true,
  },
  netConnMap: {
    "U3.1-V3_3": true, "U3.10-V3_3": true, "U3.22-V3_3": true, "U3.33-V3_3": true,
    "U3.42-V3_3": true, "U3.49-V3_3": true,
    "C12.1-V3_3": true, "C14.1-V3_3": true, "C8.1-V3_3": true, "C13.1-V3_3": true,
    "C15.1-V3_3": true, "C19.1-V3_3": true,
    "U3.23-V1_1": true, "U3.50-V1_1": true,
    "C18.1-V1_1": true, "C7.1-V1_1": true, "C9.1-V1_1": true,
    "C12.2-GND": true, "C14.2-GND": true, "C8.2-GND": true, "C13.2-GND": true,
    "C15.2-GND": true, "C19.2-GND": true, "C18.2-GND": true, "C7.2-GND": true,
    "C9.2-GND": true, "C10.2-GND": true, "C11.2-GND": true,
  },
  chipGap: 0.6,
  decouplingCapsGap: 0.2,
  partitionGap: 1.2,
}

test("Decoupling caps layout in full pipeline - LayoutPipelineSolver06", () => {
  // Create solver
  const solver = new LayoutPipelineSolver(problem)

  // Solve the complete pipeline
  solver.solve()

  // Should be solved successfully
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  // Check decoupling cap detection
  console.log("\n=== Decoupling Cap Detection ===")
  console.log("Decoupling cap groups identified:", solver.identifyDecouplingCapsSolver?.outputDecouplingCapGroups.length ?? 0)
  
  for (const group of solver.identifyDecouplingCapsSolver?.outputDecouplingCapGroups ?? []) {
    console.log(`  Group: ${group.decouplingCapGroupId}`)
    console.log(`    Main chip: ${group.mainChipId}`)
    console.log(`    Net pair: [${group.netPair.join(", ")}]`)
    console.log(`    Capacitors: [${group.decouplingCapChipIds.join(", ")}]`)
  }

  // Check partitions
  console.log("\n=== Partitions ===")
  console.log("Total partitions:", solver.chipPartitions?.length ?? 0)
  
  for (let i = 0; i < (solver.chipPartitions?.length ?? 0); i++) {
    const partition = solver.chipPartitions![i]
    const chipIds = Object.keys(partition.chipMap)
    console.log(`  Partition ${i}:`)
    console.log(`    Type: ${partition.partitionType ?? "default"}`)
    console.log(`    Chips: [${chipIds.join(", ")}]`)
    
    if (partition.partitionType === "decoupling_caps") {
      console.log(`    *** This is a decoupling caps partition ***`)
    }
  }

  // Check packed partitions
  console.log("\n=== Packed Partitions ===")
  console.log("Total packed partitions:", solver.packedPartitions?.length ?? 0)
  
  for (let i = 0; i < (solver.packedPartitions?.length ?? 0); i++) {
    const packed = solver.packedPartitions![i]
    const chipIds = Object.keys(packed.inputProblem.chipMap)
    const placements = Object.keys(packed.layout.chipPlacements)
    console.log(`  Packed Partition ${i}:`)
    console.log(`    Type: ${packed.inputProblem.partitionType ?? "default"}`)
    console.log(`    Chips: [${chipIds.join(", ")}]`)
    console.log(`    Placements: [${placements.join(", ")}]`)
    
    for (const [chipId, placement] of Object.entries(packed.layout.chipPlacements)) {
      console.log(`      ${chipId}: x=${placement.x.toFixed(2)}, y=${placement.y.toFixed(2)}`)
    }
  }

  // Test getOutputLayout method
  const outputLayout = solver.getOutputLayout()
  
  // Check for overlaps
  console.log("\n=== Overlap Detection ===")
  const overlaps = solver.checkForOverlaps(outputLayout)
  console.log(`Total overlaps: ${overlaps.length}`)
  
  for (const overlap of overlaps) {
    console.log(`  ${overlap.chip1} overlaps ${overlap.chip2} (area: ${overlap.overlapArea.toFixed(4)})`)
  }

  // Test should pass if no overlaps
  expect(overlaps.length).toBe(0)
})