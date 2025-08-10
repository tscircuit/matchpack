import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import { getExampleCircuitJson } from "../assets/ExampleCircuit04"

test("LayoutPipelineSolver04 - ExampleCircuit04 full pipeline", () => {
  // Get circuit json from ExampleCircuit04
  const circuitJson = getExampleCircuitJson()

  // Convert to InputProblem with readable IDs for easier debugging
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  // Create and run the solver
  const solver = new LayoutPipelineSolver(problem)

  // Test initial state
  expect(solver.solved).toBe(false)
  expect(solver.failed).toBe(false)

  // Test initial visualization
  const initialViz = solver.visualize()
  expect(initialViz).toBeDefined()
  expect(initialViz.rects).toBeDefined()
  expect(initialViz.points).toBeDefined()

  // Run the full pipeline
  solver.solve()

  // Verify pipeline completed successfully
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  // Test getOutputLayout
  const outputLayout = solver.getOutputLayout()
  expect(outputLayout).toBeDefined()
  expect(outputLayout.chipPlacements).toBeDefined()
  expect(outputLayout.groupPlacements).toBeDefined()

  // Verify we have placements for the expected components
  // ExampleCircuit04 has chips: U1, U2 and capacitors: C1, C2, C5, C6
  const expectedChips = ["U1", "U2"]
  for (const chipId of expectedChips) {
    expect(outputLayout.chipPlacements[chipId]).toBeDefined()
    const placement = outputLayout.chipPlacements[chipId]!
    expect(typeof placement.x).toBe("number")
    expect(typeof placement.y).toBe("number")
    expect(typeof placement.ccwRotationDegrees).toBe("number")
  }

  // Check for overlaps - should have none
  const overlaps = solver.checkForOverlaps(outputLayout)
  expect(overlaps.length).toBe(0)

  // Final visualization should work
  const finalViz = solver.visualize()
  expect(finalViz).toBeDefined()
  expect(finalViz.rects).toBeDefined()
  expect(finalViz.points).toBeDefined()
  expect(finalViz.lines).toBeDefined()

  // Verify connections are maintained
  // ExampleCircuit04 has several VIN->C6.1, C1.1, C2.1 connections
  // and GND connections, VOUT->C5.1 connection
  expect(Object.keys(problem.pinStrongConnMap).length).toBeGreaterThan(0)
  expect(Object.keys(problem.netConnMap).length).toBeGreaterThan(0)
})
