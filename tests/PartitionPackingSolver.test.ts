import { test, expect } from "bun:test"
import { PartitionPackingSolver } from "../lib/solvers/PartitionPackingSolver/PartitionPackingSolver"
import { PinRangeOverlapSolver } from "../lib/solvers/PinRangeOverlapSolver/PinRangeOverlapSolver"
import { PinRangeLayoutSolver } from "../lib/solvers/PinRangeLayoutSolver/PinRangeLayoutSolver"
import { PinRangeMatchSolver } from "../lib/solvers/PinRangeMatchSolver/PinRangeMatchSolver"
import { ChipPartitionsSolver } from "../lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import type { InputProblem } from "../lib/types/InputProblem"
import { getExampleCircuitJson } from "./assets/ExampleCircuit01"
import { getInputProblemFromCircuitJsonSchematic } from "../lib/testing/getInputProblemFromCircuitJsonSchematic"

test("PartitionPackingSolver creates correct pack input with pin pads", () => {
  const circuitJson = getExampleCircuitJson()
  const problem: InputProblem = getInputProblemFromCircuitJsonSchematic(
    circuitJson,
    { useReadableIds: true },
  )

  // Create partitions using ChipPartitionsSolver
  const chipPartitionsSolver = new ChipPartitionsSolver(problem)
  chipPartitionsSolver.solve()

  // Use partitions for PinRangeMatchSolver
  const partitions = chipPartitionsSolver.partitions
  const partitionsToUse = partitions.length > 0 ? partitions : [problem]

  console.log(`Found ${partitionsToUse.length} partitions`)

  // Get pin ranges from PinRangeMatchSolver
  const pinRangeMatchSolver = new PinRangeMatchSolver(partitionsToUse)
  pinRangeMatchSolver.solve()

  if (pinRangeMatchSolver.failed) {
    throw new Error("PinRangeMatchSolver failed")
  }

  // Get all pin ranges for layout
  const pinRanges = pinRangeMatchSolver.getAllPinRanges()

  // Create PinRangeLayoutSolver with pin ranges and input problems
  const pinRangeLayoutSolver = new PinRangeLayoutSolver(
    pinRanges,
    partitionsToUse,
  )
  pinRangeLayoutSolver.solve()

  if (pinRangeLayoutSolver.failed) {
    throw new Error("PinRangeLayoutSolver failed")
  }

  // Create PinRangeOverlapSolver
  const pinRangeOverlapSolver = new PinRangeOverlapSolver(
    pinRangeLayoutSolver,
    partitionsToUse,
  )
  pinRangeOverlapSolver.solve()

  if (pinRangeOverlapSolver.failed) {
    throw new Error("PinRangeOverlapSolver failed")
  }

  const solver = new PartitionPackingSolver(pinRangeOverlapSolver, partitionsToUse)

  // Step a few times to see what happens
  console.log("Initial state:")
  console.log("- Solved:", solver.solved)
  console.log("- Failed:", solver.failed)
  console.log("- Error:", solver.error)

  const visualBefore = solver.visualize()
  console.log("Visual before steps:", JSON.stringify(visualBefore, null, 2))

  // Take several steps
  for (let i = 0; i < 5; i++) {
    console.log(`\nStep ${i + 1}:`)
    solver.step()
    console.log("- Solved:", solver.solved)
    console.log("- Failed:", solver.failed)
    console.log("- Error:", solver.error)
    
    const visual = solver.visualize()
    console.log("Visual:", JSON.stringify(visual, null, 2))
    
    if (solver.solved || solver.failed) {
      break
    }
  }

  // Check if we have a phasedPackSolver and inspect its pack input
  if (solver.phasedPackSolver) {
    const packInput = (solver as any).phasedPackSolver.packInput
    console.log("\nPack input:", JSON.stringify(packInput, null, 2))
    
    // Verify pack input structure
    expect(packInput.components).toBeDefined()
    expect(Array.isArray(packInput.components)).toBe(true)
    
    for (const component of packInput.components) {
      console.log(`\nComponent ${component.componentId}:`)
      console.log(`- Pads count: ${component.pads.length}`)
      
      // Check that pads have proper pin names (not partition names)
      for (const pad of component.pads.slice(0, 3)) { // Just show first few
        console.log(`  - Pad: ${pad.padId}, Network: ${pad.networkId}`)
        expect(pad.padId).not.toMatch(/^partition_/)
        expect(pad.padId).toMatch(/\w+\.\w+/) // Should be like "U1.1"
      }
    }
  }
})