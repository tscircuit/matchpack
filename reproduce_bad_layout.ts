
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

// Create solver and run the pipeline
const solver = new LayoutPipelineSolver(problem)
solver.solve()

// Get the final layout
const finalLayout = solver.getOutputLayout()

// Save the layout to a file for inspection
writeFileSync(
  "reproduced_bad_layout.json",
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
console.log("Final chip placements:")
Object.entries(finalLayout.chipPlacements).forEach(([chipId, placement]) => {
  console.log(`- ${chipId}: x=${placement.x}, y=${placement.y}, rotation=${placement.ccwRotationDegrees}°`)
})
