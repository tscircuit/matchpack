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
    groupMap: {},
    groupPinMap: {},
    netMap: {},
    pinStrongConnMap: {
      "pin1-pin2": true,
      "pin2-pin1": true,
    },
    netConnMap: {},
  }

  const solver = new ChipPartitionsSolver(inputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.partitions).toHaveLength(1)
  expect(solver.partitions[0].chipMap).toEqual(inputProblem.chipMap)
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
    groupMap: {},
    groupPinMap: {},
    netMap: {},
    pinStrongConnMap: {}, // No connections between pins
    netConnMap: {},
  }

  const solver = new ChipPartitionsSolver(inputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.partitions).toHaveLength(2)

  // Each partition should contain one chip
  const partition1ChipIds = Object.keys(solver.partitions[0].chipMap)
  const partition2ChipIds = Object.keys(solver.partitions[1].chipMap)

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
    groupMap: {},
    groupPinMap: {},
    netMap: {},
    pinStrongConnMap: {
      "pin1-pin2": true, // chip1 -> chip2
      "pin2-pin1": true,
      "pin3-pin4": true, // chip2 -> chip3
      "pin4-pin3": true,
    },
    netConnMap: {},
  }

  const solver = new ChipPartitionsSolver(inputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.partitions).toHaveLength(1) // All chips are connected, so single partition
  expect(Object.keys(solver.partitions[0].chipMap)).toHaveLength(3)
  expect(solver.partitions[0].chipMap).toEqual(inputProblem.chipMap)
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
    groupMap: {},
    groupPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
  }

  const solver = new ChipPartitionsSolver(inputProblem)
  solver.solve()

  const visualization = solver.visualize()

  // Should contain visualization elements
  expect(visualization.rects.length).toBeGreaterThan(0)
  expect(visualization.texts.length).toBeGreaterThan(0)
})
