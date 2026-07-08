import { expect, test } from "bun:test"
import type { PackedPartition } from "../../lib/solvers/PackInnerPartitionsSolver/PackInnerPartitionsSolver"
import {
  PartitionPackingSolver,
  type PartitionPackingSolverInput,
} from "../../lib/solvers/PartitionPackingSolver/PartitionPackingSolver"
import type { InputProblem } from "../../lib/types/InputProblem"

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

test("PartitionPackingSolver keeps original cross-partition strong connections", () => {
  const inputProblem: InputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.1", "U1.2", "U1.3", "U1.4"],
        size: { x: 4, y: 4 },
      },
      R1: {
        chipId: "R1",
        pins: ["R1.1", "R1.2"],
        size: { x: 1, y: 0.4 },
      },
    },
    chipPinMap: {
      "U1.1": { pinId: "U1.1", offset: { x: -2, y: 1 }, side: "x-" },
      "U1.2": { pinId: "U1.2", offset: { x: -2, y: 0 }, side: "x-" },
      "U1.3": { pinId: "U1.3", offset: { x: 2, y: 0 }, side: "x+" },
      "U1.4": { pinId: "U1.4", offset: { x: 2, y: 1 }, side: "x+" },
      "R1.1": { pinId: "R1.1", offset: { x: -0.5, y: 0 }, side: "x-" },
      "R1.2": { pinId: "R1.2", offset: { x: 0.5, y: 0 }, side: "x+" },
    },
    netMap: {},
    pinStrongConnMap: {
      "U1.1-R1.1": true,
      "R1.1-U1.1": true,
    },
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  }
  const packedPartitions: PackedPartition[] = [
    {
      inputProblem: {
        ...inputProblem,
        chipMap: { U1: inputProblem.chipMap.U1! },
        chipPinMap: {
          "U1.1": inputProblem.chipPinMap["U1.1"]!,
          "U1.2": inputProblem.chipPinMap["U1.2"]!,
          "U1.3": inputProblem.chipPinMap["U1.3"]!,
          "U1.4": inputProblem.chipPinMap["U1.4"]!,
        },
        pinStrongConnMap: {},
        netConnMap: {},
      },
      layout: {
        chipPlacements: {
          U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
        },
        groupPlacements: {},
      },
    },
    {
      inputProblem: {
        ...inputProblem,
        chipMap: { R1: inputProblem.chipMap.R1! },
        chipPinMap: {
          "R1.1": inputProblem.chipPinMap["R1.1"]!,
          "R1.2": inputProblem.chipPinMap["R1.2"]!,
        },
        pinStrongConnMap: {},
        netConnMap: {},
      },
      layout: {
        chipPlacements: {
          R1: { x: 0, y: 0, ccwRotationDegrees: 0 },
        },
        groupPlacements: {},
      },
    },
  ]

  const solver = new PartitionPackingSolver({
    packedPartitions,
    inputProblem,
  })
  const connectivityMap = (solver as any).buildConnectivityMap() as Map<
    string,
    string
  >

  expect(connectivityMap.get("U1.1")).toBe("U1.1-R1.1")
  expect(connectivityMap.get("R1.1")).toBe("U1.1-R1.1")
})
