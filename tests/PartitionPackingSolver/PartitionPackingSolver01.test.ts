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

test("PartitionPackingSolver maintains >= 4:3 aspect ratio for 3 distant movable partitions", () => {
  const createChipPartition = (chipId: string): PackedPartition => ({
    inputProblem: {
      chipMap: {
        [chipId]: {
          chipId,
          pins: [`${chipId}.1`, `${chipId}.2`, `${chipId}.3`, `${chipId}.4`],
          size: { x: 1.2, y: 1.5 },
        },
      },
      chipPinMap: {
        [`${chipId}.1`]: {
          pinId: `${chipId}.1`,
          offset: { x: -0.6, y: 0.2 },
          side: "x-",
        },
        [`${chipId}.2`]: {
          pinId: `${chipId}.2`,
          offset: { x: 0.6, y: -0.2 },
          side: "x+",
        },
        [`${chipId}.3`]: {
          pinId: `${chipId}.3`,
          offset: { x: -0.6, y: -0.2 },
          side: "x-",
        },
        [`${chipId}.4`]: {
          pinId: `${chipId}.4`,
          offset: { x: 0.6, y: 0.2 },
          side: "x+",
        },
      },
      netMap: {
        GND: { netId: "GND", isGround: true },
      },
      pinStrongConnMap: {},
      netConnMap: {
        [`${chipId}.1-GND`]: true,
      },
      chipGap: 0.2,
      partitionGap: 2,
    },
    layout: {
      chipPlacements: {
        [chipId]: { x: 0, y: 0, ccwRotationDegrees: 0 },
      },
      groupPlacements: {},
    },
  })

  const packedPartitions = [
    createChipPartition("U1"),
    createChipPartition("U2"),
    createChipPartition("U3"),
  ]

  const inputProblem: PartitionPackingSolverInput["inputProblem"] = {
    chipMap: {
      ...packedPartitions[0]!.inputProblem.chipMap,
      ...packedPartitions[1]!.inputProblem.chipMap,
      ...packedPartitions[2]!.inputProblem.chipMap,
    },
    chipPinMap: {
      ...packedPartitions[0]!.inputProblem.chipPinMap,
      ...packedPartitions[1]!.inputProblem.chipPinMap,
      ...packedPartitions[2]!.inputProblem.chipPinMap,
    },
    netMap: {
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "U1.1-GND": true,
      "U2.1-GND": true,
      "U3.1-GND": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new PartitionPackingSolver({
    packedPartitions,
    inputProblem,
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.finalLayout).toBeDefined()

  const bounds = Object.entries(solver.finalLayout!.chipPlacements).reduce(
    (acc, [chipId, placement]) => {
      const chip = inputProblem.chipMap[chipId]!
      acc.minX = Math.min(acc.minX, placement.x - chip.size.x / 2)
      acc.maxX = Math.max(acc.maxX, placement.x + chip.size.x / 2)
      acc.minY = Math.min(acc.minY, placement.y - chip.size.y / 2)
      acc.maxY = Math.max(acc.maxY, placement.y + chip.size.y / 2)
      return acc
    },
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  )

  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  expect(width / height).toBeGreaterThanOrEqual(4 / 3)
})

test("PartitionPackingSolver preserves fixed-position partitions", () => {
  const packedPartitions: PackedPartition[] = [
    {
      inputProblem: {
        chipMap: {
          U1: {
            chipId: "U1",
            pins: ["U1.1"],
            size: { x: 1.2, y: 2 },
            fixedPosition: { x: 0, y: 0 },
          },
        },
        chipPinMap: {
          "U1.1": {
            pinId: "U1.1",
            offset: { x: -0.6, y: 0 },
            side: "x-",
          },
        },
        netMap: { GND: { netId: "GND" } },
        pinStrongConnMap: {},
        netConnMap: { "U1.1-GND": true },
        chipGap: 0.2,
        partitionGap: 2,
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
        chipMap: {
          U2: {
            chipId: "U2",
            pins: ["U2.1"],
            size: { x: 1.2, y: 2 },
            fixedPosition: { x: 0, y: -5 },
          },
        },
        chipPinMap: {
          "U2.1": {
            pinId: "U2.1",
            offset: { x: -0.6, y: 0 },
            side: "x-",
          },
        },
        netMap: { GND: { netId: "GND" } },
        pinStrongConnMap: {},
        netConnMap: { "U2.1-GND": true },
        chipGap: 0.2,
        partitionGap: 2,
      },
      layout: {
        chipPlacements: {
          U2: { x: 0, y: -5, ccwRotationDegrees: 0 },
        },
        groupPlacements: {},
      },
    },
  ]

  const solver = new PartitionPackingSolver({
    packedPartitions,
    inputProblem: {
      chipMap: {
        ...packedPartitions[0]!.inputProblem.chipMap,
        ...packedPartitions[1]!.inputProblem.chipMap,
      },
      chipPinMap: {
        ...packedPartitions[0]!.inputProblem.chipPinMap,
        ...packedPartitions[1]!.inputProblem.chipPinMap,
      },
      netMap: { GND: { netId: "GND" } },
      pinStrongConnMap: {},
      netConnMap: {
        "U1.1-GND": true,
        "U2.1-GND": true,
      },
      chipGap: 0.2,
      partitionGap: 2,
    },
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.finalLayout!.chipPlacements.U1).toEqual({
    x: 0,
    y: 0,
    ccwRotationDegrees: 0,
  })
  expect(solver.finalLayout!.chipPlacements.U2).toEqual({
    x: 0,
    y: -5,
    ccwRotationDegrees: 0,
  })
})
