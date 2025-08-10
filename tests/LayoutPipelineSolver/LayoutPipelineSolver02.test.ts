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
  solver.solveUntilPhase("pinRangeMatchSolver")
  expect(solver.chipPartitionsSolver?.solved).toBe(true)
  expect(solver.chipPartitions).toBeDefined()
  expect(solver.chipPartitions!.length).toBeGreaterThan(0)

  // Test the pin range match phase
  solver.solveUntilPhase("pinRangeLayoutSolver")
  expect(solver.pinRangeMatchSolver?.solved).toBe(true)

  // Don't test remaining phases if they're not implemented
  // Just verify we can visualize after each completed phase
  const partitionViz = solver.visualize()
  expect(partitionViz).toBeDefined()

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

  // Test one more phase (PinRangeMatchSolver)
  stepCount = 0
  while (
    solver.getCurrentPhase() === "pinRangeMatchSolver" &&
    stepCount < 100
  ) {
    solver.step()
    stepCount++
  }

  // Should have completed pin range match phase
  expect(solver.pinRangeMatchSolver?.solved).toBe(true)
})

test("LayoutPipelineSolver02 PinRangeLayoutSolver should not error on undefined pinRanges", () => {
  // Convert ExampleCircuit02 to InputProblem
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  // Create solver
  const solver = new LayoutPipelineSolver(problem)

  // Step until we reach pinRangeLayoutSolver phase
  solver.solveUntilPhase("pinRangeLayoutSolver")

  // Now step into the pinRangeLayoutSolver phase - should not error
  let stepCount = 0

  // This should no longer throw an error
  while (
    solver.getCurrentPhase() === "pinRangeLayoutSolver" &&
    stepCount < 50
  ) {
    solver.step()
    stepCount++

    // Make sure we're making progress and not stuck
    if (
      solver.pinRangeLayoutSolver?.solved ||
      solver.pinRangeLayoutSolver?.failed
    ) {
      break
    }
  }

  // Should have processed without the undefined error
  expect(solver.pinRangeLayoutSolver).toBeDefined()
  expect(solver.pinRangeLayoutSolver?.failed).toBeFalsy()
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

  // Verify no components are at origin (should be properly placed)
  let nonOriginPlacements = 0
  for (const placement of Object.values(outputLayout.chipPlacements)) {
    if (placement.x !== 0 || placement.y !== 0) {
      nonOriginPlacements++
    }
  }
  expect(nonOriginPlacements).toBeGreaterThan(0)
})
