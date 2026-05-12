import { test, expect } from "bun:test"
import { ChipPartitionsSolver } from "../lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import type { InputProblem } from "../lib/types/InputProblem"

test("ChipPartitionsSolver creates single partition for connected components", () => {
  // Create a simple input problem with two chips connected by a strong connection
  const inputProblem: InputProblem = {
    chipMap: {
      chip1: {
        chipId: "chip1",
        pins: ["pin1"],
        size: { x: 10, y: 10 },
      },
      chip2: {
        chipId: "chip2",
        pins: ["pin2"],
        size: { x: 10, y: 10 },
      },
    },
    chipPinMap: {
      pin1: {
        pinId: "pin1",
        offset: { x: 5, y: 2.5 },
        side: "x+" as const,
      },
      pin2: {
        pinId: "pin2",
        offset: { x: -5, y: 2.5 },
        side: "x-" as const,
      },
    },
    netMap: {},
    pinStrongConnMap: {
      "pin1-pin2": true,
      "pin2-pin1": true,
    },
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new ChipPartitionsSolver({ inputProblem })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.partitions).toHaveLength(1)
  expect(solver.partitions[0]!.chipMap).toEqual(inputProblem.chipMap)
})

test("ChipPartitionsSolver creates separate partitions for disconnected components", () => {
  // Create input problem with two disconnected chips
  const inputProblem: InputProblem = {
    chipMap: {
      chip1: {
        chipId: "chip1",
        pins: ["pin1"],
        size: { x: 10, y: 10 },
      },
      chip2: {
        chipId: "chip2",
        pins: ["pin2"],
        size: { x: 10, y: 10 },
      },
    },
    chipPinMap: {
      pin1: {
        pinId: "pin1",
        offset: { x: 5, y: 2.5 },
        side: "x+" as const,
      },
      pin2: {
        pinId: "pin2",
        offset: { x: -5, y: 2.5 },
        side: "x-" as const,
      },
    },
    netMap: {},
    pinStrongConnMap: {}, // No connections between pins
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new ChipPartitionsSolver({ inputProblem })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.partitions).toHaveLength(2)

  // Each partition should contain one chip
  const partition1ChipIds = Object.keys(solver.partitions[0]!.chipMap)
  const partition2ChipIds = Object.keys(solver.partitions[1]!.chipMap)

  expect(partition1ChipIds).toHaveLength(1)
  expect(partition2ChipIds).toHaveLength(1)
  expect([...partition1ChipIds, ...partition2ChipIds].sort()).toEqual([
    "chip1",
    "chip2",
  ])
})

test("ChipPartitionsSolver handles complex connected graph", () => {
  // Create input problem with chain of connected chips: chip1 -> chip2 -> chip3
  const inputProblem: InputProblem = {
    chipMap: {
      chip1: {
        chipId: "chip1",
        pins: ["pin1"],
        size: { x: 10, y: 10 },
      },
      chip2: {
        chipId: "chip2",
        pins: ["pin2", "pin3"],
        size: { x: 10, y: 10 },
      },
      chip3: {
        chipId: "chip3",
        pins: ["pin4"],
        size: { x: 10, y: 10 },
      },
    },
    chipPinMap: {
      pin1: {
        pinId: "pin1",
        offset: { x: 5, y: 2.5 },
        side: "x+" as const,
      },
      pin2: {
        pinId: "pin2",
        offset: { x: -5, y: 2.5 },
        side: "x-" as const,
      },
      pin3: {
        pinId: "pin3",
        offset: { x: 5, y: 2.5 },
        side: "x+" as const,
      },
      pin4: {
        pinId: "pin4",
        offset: { x: -5, y: 2.5 },
        side: "x-" as const,
      },
    },
    netMap: {},
    pinStrongConnMap: {
      "pin1-pin2": true, // chip1 -> chip2
      "pin2-pin1": true,
      "pin3-pin4": true, // chip2 -> chip3
      "pin4-pin3": true,
    },
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new ChipPartitionsSolver({ inputProblem })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.partitions).toHaveLength(1) // All chips are connected, so single partition
  expect(Object.keys(solver.partitions[0]!.chipMap)).toHaveLength(3)
  expect(solver.partitions[0]!.chipMap).toEqual(inputProblem.chipMap)
})

test("ChipPartitionsSolver visualization contains partition components", () => {
  const inputProblem: InputProblem = {
    chipMap: {
      chip1: {
        chipId: "chip1",
        pins: [],
        size: { x: 10, y: 10 },
      },
    },
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new ChipPartitionsSolver({ inputProblem })
  solver.solve()

  const visualization = solver.visualize()

  // Should contain visualization elements
  expect(visualization.rects?.length).toBeGreaterThan(0)
  expect(visualization.texts?.length).toBeGreaterThan(0)
})

test("ChipPartitionsSolver preserves inherited decoupling nets from main-chip pins", () => {
  const inputProblem: InputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.VCC", "U1.GND", "U1.IO"],
        size: { x: 4, y: 4 },
      },
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 1, y: 0.5 },
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 1, y: 0.5 },
      },
    },
    chipPinMap: {
      "U1.VCC": { pinId: "U1.VCC", offset: { x: -1, y: 2 }, side: "y+" },
      "U1.GND": { pinId: "U1.GND", offset: { x: 1, y: 2 }, side: "y+" },
      "U1.IO": { pinId: "U1.IO", offset: { x: 0, y: -2 }, side: "y-" },
      "C1.1": { pinId: "C1.1", offset: { x: -0.25, y: 0 }, side: "x-" },
      "C1.2": { pinId: "C1.2", offset: { x: 0.25, y: 0 }, side: "x+" },
      "C2.1": { pinId: "C2.1", offset: { x: -0.25, y: 0 }, side: "x-" },
      "C2.2": { pinId: "C2.2", offset: { x: 0.25, y: 0 }, side: "x+" },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
      SIG: { netId: "SIG" },
    },
    pinStrongConnMap: {
      "C1.1-U1.VCC": true,
      "U1.VCC-C1.1": true,
      "C1.2-U1.GND": true,
      "U1.GND-C1.2": true,
      "C2.1-U1.VCC": true,
      "U1.VCC-C2.1": true,
      "C2.2-U1.GND": true,
      "U1.GND-C2.2": true,
    },
    netConnMap: {
      "U1.VCC-VCC": true,
      "U1.GND-GND": true,
      "U1.IO-SIG": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new ChipPartitionsSolver({
    inputProblem,
    decouplingCapGroups: [
      {
        decouplingCapGroupId: "decap_group_U1__VCC__GND",
        mainChipId: "U1",
        decouplingCapChipIds: ["C1", "C2"],
        netPair: ["VCC", "GND"],
      },
    ],
  })

  solver.solve()

  const decapPartition = solver.partitions.find(
    (partition) => partition.partitionType === "decoupling_caps",
  )

  expect(decapPartition).toBeDefined()
  expect(Object.keys(decapPartition!.netMap).sort()).toEqual(["GND", "VCC"])
  expect(decapPartition!.netConnMap).toMatchObject({
    "C1.1-VCC": true,
    "C1.2-GND": true,
    "C2.1-VCC": true,
    "C2.2-GND": true,
  })
  expect(decapPartition!.netConnMap["C1.1-SIG"]).toBeUndefined()
  expect(decapPartition!.netConnMap["C2.1-SIG"]).toBeUndefined()
})
