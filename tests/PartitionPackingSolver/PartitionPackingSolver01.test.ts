import { test, expect } from "bun:test"
import {
  PartitionPackingSolver,
  type PartitionPackingSolverInput,
} from "../../lib/solvers/PartitionPackingSolver/PartitionPackingSolver"
import type { PackedPartition } from "../../lib/solvers/PackInnerPartitionsSolver/PackInnerPartitionsSolver"

test("PartitionPackingSolver works with single packed partition", () => {
  // Create a simple packed partition
  const packedPartitions: PackedPartition[] = [
    {
      inputProblem: {
        chipMap: {
          R7: {
            chipId: "R7",
            pins: ["R7.1", "R7.2"],
            size: { x: 1, y: 0.5 },
          },
        },
        chipPinMap: {
          "R7.1": {
            pinId: "R7.1",
            offset: { x: -0.25, y: 0 },
            side: "x-",
          },
          "R7.2": {
            pinId: "R7.2",
            offset: { x: 0.25, y: 0 },
            side: "x+",
          },
        },
        netMap: {
          GND: { netId: "GND" },
          DISABLE: { netId: "DISABLE" },
        },
        pinStrongConnMap: {},
        netConnMap: {
          "R7.1-GND": true,
          "R7.2-DISABLE": true,
        },
        chipGap: 0.2,
        partitionGap: 2,
      },
      layout: {
        chipPlacements: {
          R7: { x: 0, y: 0, ccwRotationDegrees: 0 },
        },
        groupPlacements: {},
      },
    },
  ]

  const input: PartitionPackingSolverInput = {
    packedPartitions,
    inputProblem: {
      chipMap: {
        R7: {
          chipId: "R7",
          pins: ["R7.1", "R7.2"],
          size: { x: 1, y: 0.5 },
        },
      },
      chipPinMap: {
        "R7.1": {
          pinId: "R7.1",
          offset: { x: -0.25, y: 0 },
          side: "x-",
        },
        "R7.2": {
          pinId: "R7.2",
          offset: { x: 0.25, y: 0 },
          side: "x+",
        },
      },
      netMap: {
        GND: { netId: "GND" },
        DISABLE: { netId: "DISABLE" },
      },
      pinStrongConnMap: {},
      netConnMap: {
        "R7.1-GND": true,
        "R7.2-DISABLE": true,
      },
      chipGap: 0.2,
      partitionGap: 2,
    },
  }

  console.log(`Using static input with ${packedPartitions.length} partition(s)`)

  // Create solver
  const solver = new PartitionPackingSolver(input)

  console.log("Initial state:")
  console.log(`- Solved: ${solver.solved}`)
  console.log(`- Failed: ${solver.failed}`)
  console.log(`- Error: ${solver.error}`)

  // Should not fail immediately
  expect(solver.failed).toBe(false)

  // Step 1
  solver.step()
  console.log("\\nStep 1:")
  console.log(`- Solved: ${solver.solved}`)
  console.log(`- Failed: ${solver.failed}`)
  console.log(`- Error: ${solver.error}`)

  // For a single partition, it should be solved immediately
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.finalLayout).toBeDefined()
  expect(solver.finalLayout!.chipPlacements.R7).toBeDefined()
})

test("PartitionPackingSolver works with empty partitions", () => {
  const input: PartitionPackingSolverInput = {
    packedPartitions: [],
    inputProblem: {
      chipMap: {},
      chipPinMap: {},
      netMap: {},
      pinStrongConnMap: {},
      netConnMap: {},
      chipGap: 0.2,
      partitionGap: 2,
    },
  }

  const solver = new PartitionPackingSolver(input)
  solver.step()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.finalLayout).toBeDefined()
  expect(Object.keys(solver.finalLayout!.chipPlacements).length).toBe(0)
})
