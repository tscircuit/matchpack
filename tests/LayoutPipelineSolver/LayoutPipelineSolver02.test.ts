import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getExampleCircuitJson } from "../assets/ExampleCircuit02"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

test("LayoutPipelineSolver02 runs pipeline phases for ExampleCircuit02", () => {
  // Convert ExampleCircuit02 to InputProblem with readable IDs
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  // Verify we have the expected components
  expect(Object.keys(problem.chipMap)).toContain("U1") // RT9013_33GB chip
  expect(Object.keys(problem.chipMap)).toContain("C6") // Capacitors
  expect(Object.keys(problem.chipMap)).toContain("C1")
  expect(Object.keys(problem.chipMap)).toContain("C2")
  expect(Object.keys(problem.chipMap)).toContain("C5")

  // Create solver
  const solver = new LayoutPipelineSolver(problem)

  // Test initial visualization (before solving)
  const initialViz = solver.visualize()
  expect(initialViz).toBeDefined()
  expect(initialViz.rects).toBeDefined()
  expect(initialViz.points).toBeDefined()

  // Test just the chip partitions phase
  solver.solveUntilPhase("partitionPackingSolver")
  expect(solver.chipPartitionsSolver?.solved).toBe(true)
  expect(solver.chipPartitions).toBeDefined()
  expect(solver.chipPartitions!.length).toBeGreaterThan(0)

  // Test that we can complete the full pipeline
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.partitionPackingSolver?.solved).toBe(true)

  // Test final layout can be retrieved
  const finalLayout = solver.getOutputLayout()
  expect(finalLayout).toBeDefined()
  expect(finalLayout.chipPlacements).toBeDefined()

  // Verify we can visualize the final result
  const finalViz = solver.visualize()
  expect(finalViz).toBeDefined()

  // Check that all chips in the problem have expected pin counts
  for (const [chipId, chip] of Object.entries(problem.chipMap)) {
    expect(chip.pins.length).toBeGreaterThan(0)
    expect(chip.size).toBeDefined()
    expect(chip.size.x).toBeGreaterThan(0)
    expect(chip.size.y).toBeGreaterThan(0)
  }

  // Verify strong connections exist (ExampleCircuit02 should have some pin-to-pin connections)
  const strongConnections = Object.values(problem.pinStrongConnMap).filter(
    Boolean,
  )
  expect(strongConnections.length).toBeGreaterThan(0)

  // Verify nets exist (ExampleCircuit02 should have power/ground nets)
  expect(Object.keys(problem.netMap)).toContain("GND")
  expect(Object.keys(problem.netMap)).toContain("V3_3")
  expect(Object.keys(problem.netMap)).toContain("VSYS")
})

test("LayoutPipelineSolver02 step-by-step execution", () => {
  // Convert ExampleCircuit02 to InputProblem
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  // Create solver but don't solve immediately
  const solver = new LayoutPipelineSolver(problem)

  // Initially should not be solved
  expect(solver.solved).toBe(false)
  expect(solver.failed).toBe(false)
  expect(solver.iterations).toBe(0)

  // Step through a few iterations manually
  let stepCount = 0
  while (
    solver.getCurrentPhase() === "chipPartitionsSolver" &&
    stepCount < 100
  ) {
    solver.step()
    stepCount++

    // Should be making progress
    expect(solver.iterations).toBe(stepCount)

    // Visualize at each step (this tests that visualization works throughout the pipeline)
    const stepViz = solver.visualize()
    expect(stepViz).toBeDefined()
  }

  // Should have completed chip partitions phase
  expect(stepCount).toBeGreaterThan(0)
  expect(solver.chipPartitionsSolver?.solved).toBe(true)

  // Test next phase (partitionPackingSolver)
  stepCount = 0
  while (
    solver.getCurrentPhase() === "partitionPackingSolver" &&
    stepCount < 100
  ) {
    solver.step()
    stepCount++
  }

  // Should have completed partition packing phase
  expect(solver.partitionPackingSolver?.solved).toBe(true)
})

test("LayoutPipelineSolver02 should complete simplified pipeline without errors", () => {
  // Convert ExampleCircuit02 to InputProblem
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  // Create solver
  const solver = new LayoutPipelineSolver(problem)

  // Step through the entire simplified pipeline
  solver.solve()

  // Should complete successfully without errors
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.chipPartitionsSolver?.solved).toBe(true)
  expect(solver.partitionPackingSolver?.solved).toBe(true)

  // Should be able to get final layout
  const layout = solver.getOutputLayout()
  expect(layout).toBeDefined()
  expect(Object.keys(layout.chipPlacements).length).toBeGreaterThan(0)
})

test("LayoutPipelineSolver02 complete pipeline execution", () => {
  // Convert ExampleCircuit02 to InputProblem
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

  // Verify no components are at origin (should be properly placed)
  let nonOriginPlacements = 0
  for (const placement of Object.values(outputLayout.chipPlacements)) {
    if (placement.x !== 0 || placement.y !== 0) {
      nonOriginPlacements++
    }
  }
  expect(nonOriginPlacements).toBeGreaterThan(0)

  // Test overlap detection - should have no overlaps in final layout
  const overlaps = solver.checkForOverlaps(outputLayout)
  expect(overlaps).toBeDefined()
  expect(Array.isArray(overlaps)).toBe(true)

  // Log overlap details for debugging if any are found
  if (overlaps.length > 0) {
    console.log("Overlaps found:", overlaps)
  }

  // The pipeline should produce a layout with no overlapping components
  expect(overlaps.length).toBe(0)
})

test("LayoutPipelineSolver02 overlap detection functionality", () => {
  // Convert ExampleCircuit02 to InputProblem
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  // Create solver
  const solver = new LayoutPipelineSolver(problem)

  // Create a test layout with known overlaps
  const testLayout = {
    chipPlacements: {
      U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
      C1: { x: 0.5, y: 0, ccwRotationDegrees: 0 }, // Very close to U1, likely overlapping
      C2: { x: 5, y: 5, ccwRotationDegrees: 45 }, // Far away, no overlap
    },
    groupPlacements: {},
  }

  // Test overlap detection
  const overlaps = solver.checkForOverlaps(testLayout)
  expect(overlaps).toBeDefined()
  expect(Array.isArray(overlaps)).toBe(true)

  // Should detect at least one overlap between U1 and C1
  expect(overlaps.length).toBeGreaterThan(0)

  // Verify overlap details
  const u1c1Overlap = overlaps.find(
    (overlap) =>
      (overlap.chip1 === "U1" && overlap.chip2 === "C1") ||
      (overlap.chip1 === "C1" && overlap.chip2 === "U1"),
  )
  expect(u1c1Overlap).toBeDefined()
  expect(u1c1Overlap!.overlapArea).toBeGreaterThan(0)

  // Test with no overlaps
  const noOverlapLayout = {
    chipPlacements: {
      U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
      C1: { x: 10, y: 10, ccwRotationDegrees: 0 }, // Far away
      C2: { x: -10, y: -10, ccwRotationDegrees: 90 }, // Far away with rotation
    },
    groupPlacements: {},
  }

  const noOverlaps = solver.checkForOverlaps(noOverlapLayout)
  expect(noOverlaps.length).toBe(0)
})
