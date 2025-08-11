import { describe, it, expect } from "bun:test"
import { ChipPartitionsSolver } from "../lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import { PinRangeMatchSolver } from "../lib/solvers/PinRangeMatchSolver/PinRangeMatchSolver"
import { PinRangeLayoutSolver } from "../lib/solvers/PinRangeLayoutSolver/PinRangeLayoutSolver"
import { SinglePinRangeLayoutSolver } from "../lib/solvers/PinRangeLayoutSolver/SinglePinRangeLayoutSolver"
import { getInputProblemFromCircuitJsonSchematic } from "../lib/testing/getInputProblemFromCircuitJsonSchematic"
import { getExampleCircuitJson } from "./assets/ExampleCircuit02"

describe("PinRangeLayoutSolver", () => {
  it("should solve pin range layouts step by step", () => {
    const circuitJson = getExampleCircuitJson()
    const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
      useReadableIds: true,
    })

    // Create partitions
    const chipPartitionsSolver = new ChipPartitionsSolver(problem)
    chipPartitionsSolver.solve()
    const partitions =
      chipPartitionsSolver.partitions.length > 0
        ? chipPartitionsSolver.partitions
        : [problem]

    // Get pin ranges
    const pinRangeMatchSolver = new PinRangeMatchSolver(partitions)
    pinRangeMatchSolver.solve()
    expect(pinRangeMatchSolver.solved).toBe(true)

    const pinRanges = pinRangeMatchSolver.getAllPinRanges()
    expect(pinRanges.length).toBeGreaterThan(0)

    // Test PinRangeLayoutSolver
    const solver = new PinRangeLayoutSolver(pinRanges, partitions)
    expect(solver.solved).toBe(false)
    expect(solver.failed).toBe(false)

    // Step through each pin range
    let stepCount = 0
    while (!solver.solved && !solver.failed && stepCount < 20) {
      solver.step()
      stepCount++
    }

    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
    expect(solver.completedSolvers.length).toBe(pinRanges.length)
  })

  it("should handle single pin range layouts", () => {
    const circuitJson = getExampleCircuitJson()
    const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
      useReadableIds: true,
    })

    // Create a mock pin range
    const mockPinRange = {
      pinIds: [Object.keys(problem.chipPinMap)[0]!],
      side: "x+" as const,
      chipId: Object.keys(problem.chipMap)[0],
    }

    const singleSolver = new SinglePinRangeLayoutSolver(mockPinRange, problem)
    expect(singleSolver.solved).toBe(false)

    singleSolver.step()
    expect(singleSolver.solved).toBe(true)
    expect(singleSolver.layoutApplied).toBe(true)

    // Test visualization
    const visualization = singleSolver.visualize()
    expect(visualization).toBeDefined()
    expect(visualization.rects).toBeDefined()
  })

})
