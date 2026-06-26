/**
 * Tests for DecouplingCapsLayoutSolver
 * Verifies that decoupling capacitors are arranged in clean, organized patterns
 */

import { test, expect } from "bun:test"
import { DecouplingCapsLayoutSolver } from "../lib/solvers/PackInnerPartitionsSolver/DecouplingCapsLayoutSolver"
import type { PartitionInputProblem } from "../lib/types/InputProblem"

test("DecouplingCapsLayoutSolver - Grid layout with 4 capacitors", () => {
  const inputProblem: PartitionInputProblem = {
    chipMap: {
      main_chip: {
        chipId: "main_chip",
        pins: ["main_chip.1", "main_chip.2", "main_chip.3", "main_chip.4"],
        size: { x: 2, y: 2 },
        availableRotations: [0],
      },
      cap1: {
        chipId: "cap1",
        pins: ["cap1.1", "cap1.2"],
        size: { x: 0.5, y: 0.3 },
        availableRotations: [0, 180],
      },
      cap2: {
        chipId: "cap2",
        pins: ["cap2.1", "cap2.2"],
        size: { x: 0.5, y: 0.3 },
        availableRotations: [0, 180],
      },
      cap3: {
        chipId: "cap3",
        pins: ["cap3.1", "cap3.2"],
        size: { x: 0.5, y: 0.3 },
        availableRotations: [0, 180],
      },
      cap4: {
        chipId: "cap4",
        pins: ["cap4.1", "cap4.2"],
        size: { x: 0.5, y: 0.3 },
        availableRotations: [0, 180],
      },
    },
    chipPinMap: {},
    netMap: {},
    netConnMap: {},
    pinStrongConnMap: {},
    chipGap: 0.3,
    decouplingCapsGap: 0.3,
    partitionType: "decoupling_caps",
  }

  const solver = new DecouplingCapsLayoutSolver({
    partitionInputProblem: inputProblem,
    layoutStrategy: "grid",
  })

  // Run solver to completion
  while (!solver.solved && !solver.failed) {
    solver.step()
  }

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.layout).toBeDefined()

  // Verify all chips are placed
  const placements = solver.layout!.chipPlacements
  expect(Object.keys(placements).length).toBe(5) // 1 main chip + 4 caps

  // Verify main chip is at origin
  expect(placements.main_chip?.x).toBe(0)
  expect(placements.main_chip?.y).toBe(0)

  // Verify capacitors are placed to the right of main chip
  for (const capId of ["cap1", "cap2", "cap3", "cap4"]) {
    const placement = placements[capId]
    expect(placement).toBeDefined()
    expect(placement!.x).toBeGreaterThan(0) // Should be to the right
  }
})

test("DecouplingCapsLayoutSolver - Linear layout with 3 capacitors", () => {
  const inputProblem: PartitionInputProblem = {
    chipMap: {
      main_chip: {
        chipId: "main_chip",
        pins: ["main_chip.1", "main_chip.2", "main_chip.3"],
        size: { x: 2, y: 2 },
        availableRotations: [0],
      },
      cap1: {
        chipId: "cap1",
        pins: ["cap1.1", "cap1.2"],
        size: { x: 0.5, y: 0.3 },
        availableRotations: [0, 180],
      },
      cap2: {
        chipId: "cap2",
        pins: ["cap2.1", "cap2.2"],
        size: { x: 0.5, y: 0.3 },
        availableRotations: [0, 180],
      },
      cap3: {
        chipId: "cap3",
        pins: ["cap3.1", "cap3.2"],
        size: { x: 0.5, y: 0.3 },
        availableRotations: [0, 180],
      },
    },
    chipPinMap: {},
    netMap: {},
    netConnMap: {},
    pinStrongConnMap: {},
    chipGap: 0.3,
    decouplingCapsGap: 0.3,
    partitionType: "decoupling_caps",
  }

  const solver = new DecouplingCapsLayoutSolver({
    partitionInputProblem: inputProblem,
    layoutStrategy: "linear",
  })

  while (!solver.solved && !solver.failed) {
    solver.step()
  }

  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeDefined()

  const placements = solver.layout!.chipPlacements

  // Verify capacitors are in a vertical line (same x coordinate)
  const cap1X = placements.cap1!.x
  expect(placements.cap2!.x).toBeCloseTo(cap1X, 2)
  expect(placements.cap3!.x).toBeCloseTo(cap1X, 2)

  // Verify they have different y coordinates (vertical spacing)
  const yCoords = [
    placements.cap1!.y,
    placements.cap2!.y,
    placements.cap3!.y,
  ].sort((a, b) => a - b)

  expect(yCoords[1]! - yCoords[0]!).toBeGreaterThan(0.3) // Gap between caps
  expect(yCoords[2]! - yCoords[1]!).toBeGreaterThan(0.3)
})

test("DecouplingCapsLayoutSolver - Circular layout with 6 capacitors", () => {
  const inputProblem: PartitionInputProblem = {
    chipMap: {
      main_chip: {
        chipId: "main_chip",
        pins: ["main_chip.1", "main_chip.2", "main_chip.3"],
        size: { x: 2, y: 2 },
        availableRotations: [0],
      },
      ...Object.fromEntries(
        Array.from({ length: 6 }, (_, i) => [
          `cap${i + 1}`,
          {
            chipId: `cap${i + 1}`,
            pins: [`cap${i + 1}.1`, `cap${i + 1}.2`],
            size: { x: 0.5, y: 0.3 },
            availableRotations: [0, 90, 180, 270],
          },
        ]),
      ),
    },
    chipPinMap: {},
    netMap: {},
    netConnMap: {},
    pinStrongConnMap: {},
    chipGap: 0.3,
    decouplingCapsGap: 0.5,
    partitionType: "decoupling_caps",
  }

  const solver = new DecouplingCapsLayoutSolver({
    partitionInputProblem: inputProblem,
    layoutStrategy: "circular",
  })

  while (!solver.solved && !solver.failed) {
    solver.step()
  }

  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeDefined()

  const placements = solver.layout!.chipPlacements

  // Verify all capacitors are roughly equidistant from center
  const distances = Array.from({ length: 6 }, (_, i) => {
    const placement = placements[`cap${i + 1}`]!
    return Math.sqrt(placement.x ** 2 + placement.y ** 2)
  })

  const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length
  for (const distance of distances) {
    expect(Math.abs(distance - avgDistance)).toBeLessThan(0.1) // All roughly same distance
  }
})

test("DecouplingCapsLayoutSolver - Handles partition without main chip", () => {
  const inputProblem: PartitionInputProblem = {
    chipMap: {
      cap1: {
        chipId: "cap1",
        pins: ["cap1.1", "cap1.2"],
        size: { x: 0.5, y: 0.3 },
        availableRotations: [0, 180],
      },
      cap2: {
        chipId: "cap2",
        pins: ["cap2.1", "cap2.2"],
        size: { x: 0.5, y: 0.3 },
        availableRotations: [0, 180],
      },
    },
    chipPinMap: {},
    netMap: {},
    netConnMap: {},
    pinStrongConnMap: {},
    chipGap: 0.3,
    decouplingCapsGap: 0.3,
    partitionType: "decoupling_caps",
  }

  const solver = new DecouplingCapsLayoutSolver({
    partitionInputProblem: inputProblem,
  })

  while (!solver.solved && !solver.failed) {
    solver.step()
  }

  expect(solver.solved).toBe(true)
  expect(solver.layout).toBeDefined()
  expect(Object.keys(solver.layout!.chipPlacements).length).toBe(2)
})
