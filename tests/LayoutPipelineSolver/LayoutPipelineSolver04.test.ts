import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import { getExampleCircuitJson } from "../assets/ExampleCircuit04"

test("LayoutPipelineSolver04 - ExampleCircuit04 simplified pipeline execution", () => {
  // Get circuit json from ExampleCircuit04
  const circuitJson = getExampleCircuitJson()

  // Convert to InputProblem with readable IDs for easier debugging
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  // Verify we have expected circuit components
  expect(Object.keys(problem.chipMap).length).toBeGreaterThan(0)
  expect(Object.keys(problem.chipPinMap).length).toBeGreaterThan(0)
  expect(Object.keys(problem.netMap).length).toBeGreaterThan(0)

  // Create solver and run the simplified pipeline
  const solver = new LayoutPipelineSolver(problem)

  // Test chip partitions phase
  solver.solveUntilPhase("packInnerPartitionsSolver")
  expect(solver.getCurrentPhase()).toMatchInlineSnapshot(
    `"packInnerPartitionsSolver"`,
  )
  expect(solver.chipPartitionsSolver?.solved).toBe(true)

  // Complete the pipeline
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.packInnerPartitionsSolver?.solved).toBe(true)
  expect(solver.partitionPackingSolver?.solved).toBe(true)

  // Test final layout
  const finalLayout = solver.getOutputLayout()
  expect(finalLayout).toBeDefined()
  expect(finalLayout.chipPlacements).toBeDefined()
  expect(finalLayout.groupPlacements).toBeDefined()

  // Verify all chips have placements
  const chipIds = Object.keys(problem.chipMap)
  for (const chipId of chipIds) {
    expect(finalLayout.chipPlacements[chipId]).toBeDefined()
    const placement = finalLayout.chipPlacements[chipId]!
    expect(typeof placement.x).toBe("number")
    expect(typeof placement.y).toBe("number")
    expect(typeof placement.ccwRotationDegrees).toBe("number")
  }

  // Test final visualization
  const finalViz = solver.visualize()
  expect(finalViz).toBeDefined()
  expect(finalViz.rects?.length).toBeGreaterThan(0)

  // Test overlap detection (should have no overlaps)
  const overlaps = solver.checkForOverlaps(finalLayout)
  expect(overlaps.length).toBe(0)
})
