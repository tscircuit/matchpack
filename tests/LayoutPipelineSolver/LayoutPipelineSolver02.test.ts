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
  console.log("Testing ChipPartitionsSolver phase...")
  solver.solveUntilPhase("pinRangeMatchSolver")
  expect(solver.chipPartitionsSolver?.solved).toBe(true)
  expect(solver.chipPartitions).toBeDefined()
  expect(solver.chipPartitions!.length).toBeGreaterThan(0)

  // Test the pin range match phase
  console.log("Testing PinRangeMatchSolver phase...")
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
