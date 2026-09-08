import { expect, test } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "lib/types/InputProblem"

test("SingleInnerPartitionPackingSolver places decoupling caps in horizontal row", () => {
  // Create a simple decoupling caps partition with 3 capacitors
  const problem: PartitionInputProblem = {
    isPartition: true,
    partitionType: "decoupling_caps",
    chipMap: {
      C1: {
        chipId: "C1",
        pins: ["C1.pin1", "C1.pin2"],
        size: { x: 1, y: 0.5 },
        availableRotations: [0, 180],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.pin1", "C2.pin2"],
        size: { x: 1, y: 0.5 },
        availableRotations: [0, 180],
      },
      C3: {
        chipId: "C3",
        pins: ["C3.pin1", "C3.pin2"],
        size: { x: 1, y: 0.5 },
        availableRotations: [0, 180],
      },
    },
    chipPinMap: {
      "C1.pin1": { pinId: "C1.pin1", offset: { x: 0, y: 0 }, side: "left" },
      "C1.pin2": { pinId: "C1.pin2", offset: { x: 1, y: 0 }, side: "right" },
      "C2.pin1": { pinId: "C2.pin1", offset: { x: 0, y: 0 }, side: "left" },
      "C2.pin2": { pinId: "C2.pin2", offset: { x: 1, y: 0 }, side: "right" },
      "C3.pin1": { pinId: "C3.pin1", offset: { x: 0, y: 0 }, side: "left" },
      "C3.pin2": { pinId: "C3.pin2", offset: { x: 1, y: 0 }, side: "right" },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "C1.pin1-VCC": true,
      "C1.pin2-GND": true,
      "C2.pin1-VCC": true,
      "C2.pin2-GND": true,
      "C3.pin1-VCC": true,
      "C3.pin2-GND": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
    decouplingCapsGap: 0.3,
  }

  const pinIdToStronglyConnectedPins: Record<string, any> = {}
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins,
  })

  // Solve
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const layout = solver.layout
  expect(layout).toBeDefined()
  expect(layout.chipPlacements["C1"]).toBeDefined()
  expect(layout.chipPlacements["C2"]).toBeDefined()
  expect(layout.chipPlacements["C3"]).toBeDefined()

  // All capacitors should be on the same Y axis (horizontal row)
  const y1 = layout.chipPlacements["C1"]!.y
  const y2 = layout.chipPlacements["C2"]!.y
  const y3 = layout.chipPlacements["C3"]!.y
  expect(Math.abs(y1 - y2)).toBeLessThan(0.001)
  expect(Math.abs(y2 - y3)).toBeLessThan(0.001)

  // C1 should be to the left of C2, C2 to the left of C3 (sorted by ID)
  const x1 = layout.chipPlacements["C1"]!.x
  const x2 = layout.chipPlacements["C2"]!.x
  const x3 = layout.chipPlacements["C3"]!.x
  expect(x1).toBeLessThan(x2)
  expect(x2).toBeLessThan(x3)

  // All capacitors should have 0 rotation (they're symmetric)
  expect(layout.chipPlacements["C1"]!.ccwRotationDegrees).toBe(0)
  expect(layout.chipPlacements["C2"]!.ccwRotationDegrees).toBe(0)
  expect(layout.chipPlacements["C3"]!.ccwRotationDegrees).toBe(0)

  // Layout should be centered around x=0
  const avgX = (x1 + x2 + x3) / 3
  expect(Math.abs(avgX)).toBeLessThan(0.1)
})
