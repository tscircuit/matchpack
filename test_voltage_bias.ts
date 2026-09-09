
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import { getExampleCircuitJson } from "./tests/assets/ExampleCircuit04"
import { writeFileSync } from "fs"

// Get circuit json from ExampleCircuit04
const circuitJson = getExampleCircuitJson()

// Convert to InputProblem with readable IDs for easier debugging
const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
  useReadableIds: true,
})

// Mark V3_3 and VSYS as positive voltage sources that should be routed upward
for (const netId in problem.netMap) {
  if (netId === "V3_3" || netId === "VSYS" || netId === "VCC") {
    problem.netMap[netId].isPositiveVoltageSource = true
    problem.netMap[netId].preferUpwardRouting = true
  }
}

// Create solver and run the pipeline
const solver = new LayoutPipelineSolver(problem)
solver.solve()

// Get the final layout
const finalLayout = solver.getOutputLayout()

// Save the layout to a file for inspection
writeFileSync(
  "voltage_bias_layout.json",
  JSON.stringify(finalLayout, null, 2)
)

// Visualize the layout
const finalViz = solver.visualize()

// Check for overlaps
const overlaps = solver.checkForOverlaps(finalLayout)
console.log(`Overlaps detected: ${overlaps.length}`)
if (overlaps.length > 0) {
  console.log("Overlapping chips:")
  overlaps.forEach(overlap => {
    console.log(`- ${overlap.chip1} overlaps with ${overlap.chip2} (area: ${overlap.overlapArea})`)
  })
}

// Print the layout for reference
console.log("Final chip placements with voltage bias:")
Object.entries(finalLayout.chipPlacements).forEach(([chipId, placement]) => {
  console.log(`- ${chipId}: x=${placement.x}, y=${placement.y}, rotation=${placement.ccwRotationDegrees}°`)
})

// Check if voltage nets are positioned higher (lower y values)
const voltageNets = ["V3_3", "VSYS", "VCC"]
for (const chipId in finalLayout.chipPlacements) {
  const chip = problem.chipMap[chipId]
  if (!chip) continue

  for (const pinId of chip.pins) {
    const pin = problem.chipPinMap[pinId]
    if (!pin) continue

    // Find the net connected to this pin
    for (const [connKey, connected] of Object.entries(problem.netConnMap)) {
      if (connected && connKey.includes(pinId)) {
        const [pinIdPart, netId] = connKey.split("-")
        if (pinIdPart === pinId && voltageNets.includes(netId)) {
          console.log(`Voltage net ${netId} connected to ${chipId} at position (${finalLayout.chipPlacements[chipId].x}, ${finalLayout.chipPlacements[chipId].y})`)
        }
      }
    }
  }
}
