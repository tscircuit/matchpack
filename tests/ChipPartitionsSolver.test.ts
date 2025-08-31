import { test, expect } from "bun:test"
import { ChipPartitionsSolver } from "../lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import type { InputProblem } from "../lib/types/InputProblem"
import { getInputProblemFromCircuitJsonSchematic } from "../lib/testing/getInputProblemFromCircuitJsonSchematic"

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

  const solver = new ChipPartitionsSolver(inputProblem)
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

  const solver = new ChipPartitionsSolver(inputProblem)
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

  const solver = new ChipPartitionsSolver(inputProblem)
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

  const solver = new ChipPartitionsSolver(inputProblem)
  solver.solve()

  const visualization = solver.visualize()

  // Should contain visualization elements
  expect(visualization.rects?.length).toBeGreaterThan(0)
  expect(visualization.texts?.length).toBeGreaterThan(0)
})

test("ChipPartitionsSolver handles 3x3 symmetric switch matrix with diodes", () => {
  // 3x3 switch matrix with diodes - symmetric group repro 47
  const circuitJson = {
    chips: [
      {
        chipId: "schematic_component_0",
        center: {
          x: 0,
          y: 0,
        },
        width: 1.5,
        height: 1.4,
        pins: [
          {
            pinId: "J1.1",
            x: 1.15,
            y: 0.5,
          },
          {
            pinId: "J1.2",
            x: 1.15,
            y: 0.30000000000000004,
          },
          {
            pinId: "J1.3",
            x: 1.15,
            y: 0.10000000000000009,
          },
          {
            pinId: "J1.4",
            x: 1.15,
            y: -0.09999999999999998,
          },
          {
            pinId: "J1.5",
            x: 1.15,
            y: -0.3,
          },
          {
            pinId: "J1.6",
            x: 1.15,
            y: -0.5,
          },
        ],
      },
      {
        chipId: "schematic_component_1",
        center: {
          x: 1.56,
          y: 4.308333333333334,
        },
        width: 1,
        height: 0.45,
        pins: [
          {
            pinId: "SW1.1",
            x: 1.09,
            y: 4.258333333333334,
          },
          {
            pinId: "SW1.2",
            x: 2.0300000000000002,
            y: 4.258333333333334,
          },
        ],
      },
      {
        chipId: "schematic_component_2",
        center: {
          x: 0.3599999999999999,
          y: 4.308333333333334,
        },
        width: 1.04,
        height: 0.54,
        pins: [
          {
            pinId: "D1.1",
            x: -0.16000000000000014,
            y: 4.308333333333334,
          },
          {
            pinId: "D1.2",
            x: 0.8799999999999999,
            y: 4.308333333333334,
          },
        ],
      },
      {
        chipId: "schematic_component_3",
        center: {
          x: 5.06,
          y: 0.3583333333333334,
        },
        width: 1,
        height: 0.45,
        pins: [
          {
            pinId: "SW2.1",
            x: 4.59,
            y: 0.30833333333333357,
          },
          {
            pinId: "SW2.2",
            x: 5.529999999999999,
            y: 0.30833333333333357,
          },
        ],
      },
      {
        chipId: "schematic_component_4",
        center: {
          x: 3.8599999999999994,
          y: 0.3583333333333334,
        },
        width: 1.04,
        height: 0.54,
        pins: [
          {
            pinId: "D2.1",
            x: 3.34,
            y: 0.3583333333333334,
          },
          {
            pinId: "D2.2",
            x: 4.38,
            y: 0.3583333333333334,
          },
        ],
      },
      {
        chipId: "schematic_component_5",
        center: {
          x: 3.163333333333334,
          y: 10.185,
        },
        width: 1,
        height: 0.45,
        pins: [
          {
            pinId: "SW3.1",
            x: 2.6933333333333342,
            y: 10.135,
          },
          {
            pinId: "SW3.2",
            x: 3.6333333333333337,
            y: 10.135,
          },
        ],
      },
      {
        chipId: "schematic_component_6",
        center: {
          x: 1.9633333333333338,
          y: 10.185,
        },
        width: 1.04,
        height: 0.54,
        pins: [
          {
            pinId: "D3.1",
            x: 1.4433333333333338,
            y: 10.185,
          },
          {
            pinId: "D3.2",
            x: 2.4833333333333343,
            y: 10.185,
          },
        ],
      },
      {
        chipId: "schematic_component_7",
        center: {
          x: 3.8100000000000005,
          y: 3.715,
        },
        width: 1,
        height: 0.45,
        pins: [
          {
            pinId: "SW4.1",
            x: 3.3400000000000007,
            y: 3.665,
          },
          {
            pinId: "SW4.2",
            x: 4.28,
            y: 3.665,
          },
        ],
      },
      {
        chipId: "schematic_component_8",
        center: {
          x: 2.6100000000000003,
          y: 3.715,
        },
        width: 1.04,
        height: 0.54,
        pins: [
          {
            pinId: "D4.1",
            x: 2.0900000000000003,
            y: 3.715,
          },
          {
            pinId: "D4.2",
            x: 3.1300000000000003,
            y: 3.715,
          },
        ],
      },
      {
        chipId: "schematic_component_9",
        center: {
          x: 3.34,
          y: 5.783333333333333,
        },
        width: 1,
        height: 0.45,
        pins: [
          {
            pinId: "SW5.1",
            x: 2.87,
            y: 5.733333333333333,
          },
          {
            pinId: "SW5.2",
            x: 3.8099999999999996,
            y: 5.733333333333333,
          },
        ],
      },
      {
        chipId: "schematic_component_10",
        center: {
          x: 2.1399999999999997,
          y: 5.783333333333333,
        },
        width: 1.04,
        height: 0.54,
        pins: [
          {
            pinId: "D5.1",
            x: 1.6199999999999999,
            y: 5.783333333333333,
          },
          {
            pinId: "D5.2",
            x: 2.66,
            y: 5.783333333333333,
          },
        ],
      },
      {
        chipId: "schematic_component_11",
        center: {
          x: 1.4249999999999998,
          y: 2.17,
        },
        width: 1,
        height: 0.45,
        pins: [
          {
            pinId: "SW6.1",
            x: 0.9550000000000001,
            y: 2.12,
          },
          {
            pinId: "SW6.2",
            x: 1.8949999999999996,
            y: 2.12,
          },
        ],
      },
      {
        chipId: "schematic_component_12",
        center: {
          x: 0.22499999999999964,
          y: 2.17,
        },
        width: 1.04,
        height: 0.54,
        pins: [
          {
            pinId: "D6.1",
            x: -0.2950000000000004,
            y: 2.17,
          },
          {
            pinId: "D6.2",
            x: 0.7450000000000001,
            y: 2.17,
          },
        ],
      },
      {
        chipId: "schematic_component_13",
        center: {
          x: 4.9799999999999995,
          y: -3.4499999999999997,
        },
        width: 1,
        height: 0.45,
        pins: [
          {
            pinId: "SW7.1",
            x: 4.51,
            y: -3.4999999999999996,
          },
          {
            pinId: "SW7.2",
            x: 5.449999999999999,
            y: -3.4999999999999996,
          },
        ],
      },
      {
        chipId: "schematic_component_14",
        center: {
          x: 3.7799999999999994,
          y: -3.4499999999999997,
        },
        width: 1.04,
        height: 0.54,
        pins: [
          {
            pinId: "D7.1",
            x: 3.2599999999999993,
            y: -3.4499999999999997,
          },
          {
            pinId: "D7.2",
            x: 4.299999999999999,
            y: -3.4499999999999997,
          },
        ],
      },
      {
        chipId: "schematic_component_15",
        center: {
          x: 2.944999999999998,
          y: -6.048333333333334,
        },
        width: 1,
        height: 0.45,
        pins: [
          {
            pinId: "SW8.1",
            x: 2.474999999999998,
            y: -6.098333333333334,
          },
          {
            pinId: "SW8.2",
            x: 3.414999999999998,
            y: -6.098333333333334,
          },
        ],
      },
      {
        chipId: "schematic_component_16",
        center: {
          x: 1.744999999999998,
          y: -6.048333333333334,
        },
        width: 1.04,
        height: 0.54,
        pins: [
          {
            pinId: "D8.1",
            x: 1.224999999999998,
            y: -6.048333333333334,
          },
          {
            pinId: "D8.2",
            x: 2.264999999999998,
            y: -6.048333333333334,
          },
        ],
      },
      {
        chipId: "schematic_component_17",
        center: {
          x: 4.409999999999998,
          y: -7.788333333333336,
        },
        width: 1,
        height: 0.45,
        pins: [
          {
            pinId: "SW9.1",
            x: 3.9399999999999986,
            y: -7.838333333333335,
          },
          {
            pinId: "SW9.2",
            x: 4.879999999999998,
            y: -7.838333333333335,
          },
        ],
      },
      {
        chipId: "schematic_component_18",
        center: {
          x: 3.209999999999998,
          y: -7.788333333333336,
        },
        width: 1.04,
        height: 0.54,
        pins: [
          {
            pinId: "D9.1",
            x: 2.6899999999999977,
            y: -7.788333333333336,
          },
          {
            pinId: "D9.2",
            x: 3.7299999999999986,
            y: -7.788333333333336,
          },
        ],
      },
    ],
    directConnections: [
      {
        pinIds: ["D1.2", "SW1.1"],
        netId: ".D1 > .cathode to .SW1 > .pin1",
      },
      {
        pinIds: ["D2.2", "SW2.1"],
        netId: ".D2 > .cathode to .SW2 > .pin1",
      },
      {
        pinIds: ["D3.2", "SW3.1"],
        netId: ".D3 > .cathode to .SW3 > .pin1",
      },
      {
        pinIds: ["D4.2", "SW4.1"],
        netId: ".D4 > .cathode to .SW4 > .pin1",
      },
      {
        pinIds: ["D5.2", "SW5.1"],
        netId: ".D5 > .cathode to .SW5 > .pin1",
      },
      {
        pinIds: ["D6.2", "SW6.1"],
        netId: ".D6 > .cathode to .SW6 > .pin1",
      },
      {
        pinIds: ["D7.2", "SW7.1"],
        netId: ".D7 > .cathode to .SW7 > .pin1",
      },
      {
        pinIds: ["D8.2", "SW8.1"],
        netId: ".D8 > .cathode to .SW8 > .pin1",
      },
      {
        pinIds: ["D9.2", "SW9.1"],
        netId: ".D9 > .cathode to .SW9 > .pin1",
      },
    ],
    netConnections: [
      {
        netId: "ROW0",
        pinIds: ["J1.1", "D1.1", "D2.1", "D3.1"],
      },
      {
        netId: "ROW1",
        pinIds: ["J1.2", "D4.1", "D5.1", "D6.1"],
      },
      {
        netId: "ROW2",
        pinIds: ["J1.3", "D7.1", "D8.1", "D9.1"],
      },
    ],
    availableNetLabelOrientations: {},
    maxMspPairDistance: 5,
  }

  // Create InputProblem directly from the circuit data
  const inputProblem: InputProblem = {
    chipMap: {},
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  }

  // Add chips to chipMap and pins to chipPinMap
  for (const chip of circuitJson.chips) {
    const chipId = chip.chipId.replace("schematic_component_", "chip_")
    const pinIds = chip.pins.map((pin) => pin.pinId)

    inputProblem.chipMap[chipId] = {
      chipId,
      pins: pinIds,
      size: { x: chip.width, y: chip.height },
    }

    // Add pins to chipPinMap
    for (const pin of chip.pins) {
      inputProblem.chipPinMap[pin.pinId] = {
        pinId: pin.pinId,
        offset: {
          x: pin.x - chip.center.x,
          y: pin.y - chip.center.y,
        },
        side: "x+" as const, // Default side
      }
    }
  }

  // Add nets to netMap
  for (const netConn of circuitJson.netConnections) {
    inputProblem.netMap[netConn.netId] = {
      netId: netConn.netId,
    }
  }

  // Add direct connections as strong connections
  for (const directConn of circuitJson.directConnections) {
    const [pin1, pin2] = directConn.pinIds
    if (pin1 && pin2) {
      inputProblem.pinStrongConnMap[`${pin1}-${pin2}`] = true
      inputProblem.pinStrongConnMap[`${pin2}-${pin1}`] = true
    }
  }

  // Add net connections as weak connections
  for (const netConn of circuitJson.netConnections) {
    for (const pinId of netConn.pinIds) {
      inputProblem.netConnMap[`${pinId}-${netConn.netId}`] = true
    }
  }
  const solver = new ChipPartitionsSolver(inputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)

  // The 3x3 switch matrix creates 2 partitions:
  // - Partition 0: J1 connector (isolated via weak net connections only)
  // - Partition 1: All switches and diodes (connected via strong diode-to-switch connections)
  expect(solver.partitions).toHaveLength(2)

  // Verify all 19 components are distributed across partitions
  const totalChips = solver.partitions.reduce(
    (sum, partition) => sum + Object.keys(partition.chipMap).length,
    0,
  )
  expect(totalChips).toBe(19)

  // Verify partition structure
  const partition0Chips = Object.keys(solver.partitions[0]!.chipMap)
  const partition1Chips = Object.keys(solver.partitions[1]!.chipMap)

  // J1 connector should be in its own partition (connected only via weak net connections)
  expect(partition0Chips).toHaveLength(1)
  expect(partition0Chips[0]).toBe("chip_0") // J1 connector

  // All switches and diodes should be in the other partition (18 components)
  expect(partition1Chips).toHaveLength(18)
})
