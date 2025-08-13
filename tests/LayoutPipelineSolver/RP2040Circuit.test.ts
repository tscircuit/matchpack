import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getExampleCircuitJson } from "../assets/RP2040Circuit"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

test("RP2040Circuit circuit JSON generation", () => {
  // Test basic circuit JSON generation
  const circuitJson = getExampleCircuitJson()
  
  expect(circuitJson).toBeDefined()
  expect(Array.isArray(circuitJson)).toBe(true)
  expect(circuitJson.length).toBeGreaterThan(0)
  
  // Debug: Log all components to see what we're getting
  const schematicComponents = circuitJson.filter(item => item.type === "schematic_component")
  console.log("All schematic components:")
  schematicComponents.forEach(comp => {
    console.log(`- ${comp.name}: ${comp.schematic_component_type}`)
  })
  
  expect(schematicComponents.length).toBeGreaterThan(0)
  
  // Should have the RP2040 chip (U3)
  const rp2040Component = schematicComponents.find(comp => comp.name === "U3")
  expect(rp2040Component).toBeDefined()
  expect(rp2040Component?.schematic_component_type).toBe("chip")
  
  // Should have capacitors (C7, C8, C9, C10, C11, C12, C13, C14, C15, C18, C19)
  const capacitorComponents = schematicComponents.filter(comp => 
    comp.schematic_component_type === "capacitor"
  )
  expect(capacitorComponents.length).toBe(11) // 6 IOVDD + 2 DVDD + 3 VREG capacitors
  
  console.log("Circuit JSON generated successfully with", circuitJson.length, "items")
  console.log("Found", schematicComponents.length, "schematic components")
  console.log("Found", capacitorComponents.length, "capacitors")
})

test("RP2040Circuit InputProblem conversion", () => {
  // Convert RP2040Circuit to InputProblem
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })
  
  // Basic structure validation
  expect(problem).toBeDefined()
  expect(problem.chipMap).toBeDefined()
  expect(problem.chipPinMap).toBeDefined()
  expect(problem.netMap).toBeDefined()
  expect(problem.netConnMap).toBeDefined()
  expect(problem.pinStrongConnMap).toBeDefined()
  
  // Should have the RP2040 chip
  expect(problem.chipMap["U3"]).toBeDefined()
  expect(problem.chipMap["U3"].pins.length).toBe(57) // RP2040 has 57 pins
  
  // Should have all the capacitors
  const capacitorChips = Object.keys(problem.chipMap).filter(id => 
    ["C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C18", "C19"].includes(id)
  )
  expect(capacitorChips.length).toBe(11)
  
  // All chips should have valid sizes
  for (const [chipId, chip] of Object.entries(problem.chipMap)) {
    expect(chip.size).toBeDefined()
    expect(chip.size.x).toBeGreaterThan(0)
    expect(chip.size.y).toBeGreaterThan(0)
    expect(chip.pins.length).toBeGreaterThan(0)
    console.log(`Chip ${chipId}: ${chip.pins.length} pins, size: ${chip.size.x}x${chip.size.y}`)
  }
  
  // Should have expected nets
  expect(problem.netMap["V3_3"]).toBeDefined()
  expect(problem.netMap["V1_1"]).toBeDefined()
  expect(problem.netMap["GND"]).toBeDefined()
  
  // Should have pin mappings for all pins
  const allPinIds = Object.values(problem.chipMap).flatMap(chip => chip.pins)
  for (const pinId of allPinIds) {
    expect(problem.chipPinMap[pinId]).toBeDefined()
    expect(problem.chipPinMap[pinId].pinId).toBe(pinId)
    expect(problem.chipPinMap[pinId].side).toBeDefined()
  }
  
  console.log("InputProblem created with", Object.keys(problem.chipMap).length, "chips")
  console.log("Total pins:", allPinIds.length)
  console.log("Nets:", Object.keys(problem.netMap).join(", "))
})

test("RP2040Circuit LayoutPipelineSolver initialization", () => {
  // Convert RP2040Circuit to InputProblem
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })
  
  // Create solver - this should not throw the "boxes" error
  const solver = new LayoutPipelineSolver(problem)
  
  expect(solver).toBeDefined()
  expect(solver.solved).toBe(false)
  expect(solver.failed).toBe(false)
  expect(solver.iterations).toBe(0)
  
  // Test initial visualization - this is where the "boxes" error likely occurs
  const initialViz = solver.visualize()
  expect(initialViz).toBeDefined()
  expect(initialViz.rects).toBeDefined()
  expect(initialViz.points).toBeDefined()
  expect(initialViz.lines).toBeDefined()
  expect(initialViz.texts).toBeDefined()
  
  // Should have rectangles for all chips
  expect(initialViz.rects!.length).toBeGreaterThanOrEqual(Object.keys(problem.chipMap).length)
  
  console.log("Initial visualization created with:")
  console.log("- Rectangles:", initialViz.rects?.length)
  console.log("- Points:", initialViz.points?.length)
  console.log("- Lines:", initialViz.lines?.length)
  console.log("- Texts:", initialViz.texts?.length)
})

test("RP2040Circuit solver first phase execution", () => {
  // Convert RP2040Circuit to InputProblem
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })
  
  // Create solver
  const solver = new LayoutPipelineSolver(problem)
  
  // Test just the first phase (ChipPartitionsSolver)
  solver.solveUntilPhase("pinRangeMatchSolver")
  
  expect(solver.chipPartitionsSolver).toBeDefined()
  expect(solver.chipPartitionsSolver!.solved).toBe(true)
  expect(solver.chipPartitions).toBeDefined()
  expect(solver.chipPartitions!.length).toBeGreaterThan(0)
  
  // Test visualization after first phase
  const partitionViz = solver.visualize()
  expect(partitionViz).toBeDefined()
  expect(partitionViz.rects).toBeDefined()
  
  console.log("ChipPartitionsSolver completed with", solver.chipPartitions!.length, "partitions")
})

test("RP2040Circuit complete pipeline execution", () => {
  // Convert RP2040Circuit to InputProblem
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })
  
  // Create solver
  const solver = new LayoutPipelineSolver(problem)
  
  // Solve the complete pipeline
  solver.solve()
  
  // Should be solved successfully
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  
  // Verify all phases completed
  expect(solver.chipPartitionsSolver?.solved).toBe(true)
  expect(solver.pinRangeMatchSolver?.solved).toBe(true)
  expect(solver.pinRangeLayoutSolver?.solved).toBe(true)
  expect(solver.pinRangeOverlapSolver?.solved).toBe(true)
  expect(solver.partitionPackingSolver?.solved).toBe(true)
  
  // Test getOutputLayout method
  const outputLayout = solver.getOutputLayout()
  expect(outputLayout).toBeDefined()
  expect(outputLayout.chipPlacements).toBeDefined()
  expect(outputLayout.groupPlacements).toBeDefined()
  
  // Should have placements for all chips
  const chipIds = Object.keys(problem.chipMap)
  for (const chipId of chipIds) {
    expect(outputLayout.chipPlacements[chipId]).toBeDefined()
    const placement = outputLayout.chipPlacements[chipId]!
    expect(typeof placement.x).toBe("number")
    expect(typeof placement.y).toBe("number")
    expect(typeof placement.ccwRotationDegrees).toBe("number")
  }
  
  // Test final visualization
  const finalViz = solver.visualize()
  expect(finalViz).toBeDefined()
  expect(finalViz.rects).toBeDefined()
  expect(finalViz.rects!.length).toBeGreaterThan(0)
  
  // Test overlap detection
  const overlaps = solver.checkForOverlaps(outputLayout)
  expect(overlaps).toBeDefined()
  expect(Array.isArray(overlaps)).toBe(true)
  
  console.log("Complete pipeline solved successfully")
  console.log("Final layout has", Object.keys(outputLayout.chipPlacements).length, "chip placements")
  console.log("Overlaps found:", overlaps.length)
  
  if (overlaps.length > 0) {
    console.log("Overlap details:", overlaps)
  }
})