import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getExampleCircuitJson } from "../assets/RP2040Circuit"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

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
  expect(problem.chipMap["U3"]!.pins.length).toBe(57) // RP2040 has 57 pins

  // Should have all the capacitors
  const capacitorChips = Object.keys(problem.chipMap).filter((id) =>
    [
      "C7",
      "C8",
      "C9",
      "C10",
      "C11",
      "C12",
      "C13",
      "C14",
      "C15",
      "C18",
      "C19",
    ].includes(id),
  )
  expect(capacitorChips.length).toBe(11)

  // All chips should have valid sizes
  for (const [chipId, chip] of Object.entries(problem.chipMap)) {
    expect(chip.size).toBeDefined()
    expect(chip.size.x).toBeGreaterThan(0)
    expect(chip.size.y).toBeGreaterThan(0)
    expect(chip.pins.length).toBeGreaterThan(0)
    console.log(
      `Chip ${chipId}: ${chip.pins.length} pins, size: ${chip.size.x}x${chip.size.y}`,
    )
  }

  // Should have expected nets
  expect(problem.netMap["V3_3"]).toBeDefined()
  expect(problem.netMap["V1_1"]).toBeDefined()
  expect(problem.netMap["GND"]).toBeDefined()

  // Should have pin mappings for all pins
  const allPinIds = Object.values(problem.chipMap).flatMap((chip) => chip.pins)
  for (const pinId of allPinIds) {
    expect(problem.chipPinMap[pinId]).toBeDefined()
    expect(problem.chipPinMap[pinId]!.pinId).toBe(pinId)
    expect(problem.chipPinMap[pinId]!.side).toBeDefined()
  }

  console.log(
    "InputProblem created with",
    Object.keys(problem.chipMap).length,
    "chips",
  )
  console.log("Total pins:", allPinIds.length)
  console.log("Nets:", Object.keys(problem.netMap).join(", "))
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
  console.log(solver.failed, solver.solved, solver.error)
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  // Verify all phases completed
  expect(solver.chipPartitionsSolver?.solved).toBe(true)
  expect(solver.packInnerPartitionsSolver?.solved).toBe(true)
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
  expect(overlaps.length).toBe(0)
})
