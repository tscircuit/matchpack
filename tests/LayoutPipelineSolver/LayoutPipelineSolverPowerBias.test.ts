import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import { getExampleCircuitJson } from "../assets/ExampleCircuit04"

test("LayoutPipelineSolverPowerBias - verifies VCC and GND sorting", () => {
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  // Create solver and run the pipeline
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()
  expect(solver.solved).toBe(true)

  const finalLayout = solver.getOutputLayout()
  expect(finalLayout).toBeDefined()

  // Let's verify that decoupling capacitors C1, C2, C5, C6
  // are oriented such that their positive pins (Pin 1) are above their ground pins (Pin 2).
  // In schematic layouts, negative Y is upward. So absolutePin1Y should be less than absolutePin2Y.
  for (const capId of ["C1", "C2", "C5", "C6"]) {
    const placement = finalLayout.chipPlacements[capId]
    expect(placement).toBeDefined()

    const chip = problem.chipMap[capId]
    expect(chip).toBeDefined()

    // Get pin 1 and pin 2
    const pin1Id = chip!.pins.find((p) => p.endsWith(".1"))
    const pin2Id = chip!.pins.find((p) => p.endsWith(".2"))

    expect(pin1Id).toBeDefined()
    expect(pin2Id).toBeDefined()

    const pin1 = problem.chipPinMap[pin1Id!]
    const pin2 = problem.chipPinMap[pin2Id!]

    expect(pin1).toBeDefined()
    expect(pin2).toBeDefined()

    // Calculate rotated offset for pin 1
    let rotatedPin1Offset = { x: pin1!.offset.x, y: pin1!.offset.y }
    const rot = placement!.ccwRotationDegrees ?? 0
    if (rot === 90) {
      rotatedPin1Offset = { x: -pin1!.offset.y, y: pin1!.offset.x }
    } else if (rot === 180) {
      rotatedPin1Offset = { x: -pin1!.offset.x, y: -pin1!.offset.y }
    } else if (rot === 270) {
      rotatedPin1Offset = { x: pin1!.offset.y, y: -pin1!.offset.x }
    }

    // Calculate rotated offset for pin 2
    let rotatedPin2Offset = { x: pin2!.offset.x, y: pin2!.offset.y }
    if (rot === 90) {
      rotatedPin2Offset = { x: -pin2!.offset.y, y: pin2!.offset.x }
    } else if (rot === 180) {
      rotatedPin2Offset = { x: -pin2!.offset.x, y: -pin2!.offset.y }
    } else if (rot === 270) {
      rotatedPin2Offset = { x: pin2!.offset.y, y: -pin2!.offset.x }
    }

    const absolutePin1Y = placement!.y + rotatedPin1Offset.y
    const absolutePin2Y = placement!.y + rotatedPin2Offset.y

    // Pin 1 (positive net) should be above (more negative Y) than Pin 2 (GND)
    console.log(
      `${capId} absolute pin Y: Pin 1 (VCC) = ${absolutePin1Y}, Pin 2 (GND) = ${absolutePin2Y}`,
    )
    expect(absolutePin1Y).toBeLessThan(absolutePin2Y)
  }
})
