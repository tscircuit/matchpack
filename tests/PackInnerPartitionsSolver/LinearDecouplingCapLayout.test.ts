import { test, expect } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { IdentifyDecouplingCapsSolver } from "lib/solvers/IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import { ChipPartitionsSolver } from "lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import { SingleInnerPartitionPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import { getPinIdToStronglyConnectedPinsObj } from "lib/solvers/LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"
import type {
  InputProblem,
  PartitionInputProblem,
} from "lib/types/InputProblem"

/**
 * Minimal test problem with a main chip (U1) and 4 decoupling capacitors
 * connected to it via strong pin connections, on GND and VCC nets.
 */
const decouplingCapProblem: InputProblem = {
  chipMap: {
    U1: {
      chipId: "U1",
      pins: ["U1.1", "U1.2", "U1.3", "U1.4", "U1.5", "U1.6", "U1.7", "U1.8"],
      size: { x: 2, y: 2 },
      availableRotations: [0, 90, 180, 270],
    },
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 0.53, y: 1.06 },
      availableRotations: [0],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 0.53, y: 1.06 },
      availableRotations: [0],
    },
    C3: {
      chipId: "C3",
      pins: ["C3.1", "C3.2"],
      size: { x: 0.53, y: 1.06 },
      availableRotations: [0],
    },
    C4: {
      chipId: "C4",
      pins: ["C4.1", "C4.2"],
      size: { x: 0.53, y: 1.06 },
      availableRotations: [0],
    },
  },
  chipPinMap: {
    "U1.1": { pinId: "U1.1", offset: { x: -1.4, y: 0.6 }, side: "x-" },
    "U1.2": { pinId: "U1.2", offset: { x: -1.4, y: 0.2 }, side: "x-" },
    "U1.3": { pinId: "U1.3", offset: { x: -1.4, y: -0.2 }, side: "x-" },
    "U1.4": { pinId: "U1.4", offset: { x: -1.4, y: -0.6 }, side: "x-" },
    "U1.5": { pinId: "U1.5", offset: { x: 1.4, y: 0.6 }, side: "x+" },
    "U1.6": { pinId: "U1.6", offset: { x: 1.4, y: 0.2 }, side: "x+" },
    "U1.7": { pinId: "U1.7", offset: { x: 1.4, y: -0.2 }, side: "x+" },
    "U1.8": { pinId: "U1.8", offset: { x: 1.4, y: -0.6 }, side: "x+" },
    "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C2.1": { pinId: "C2.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C2.2": { pinId: "C2.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C3.1": { pinId: "C3.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C3.2": { pinId: "C3.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C4.1": { pinId: "C4.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C4.2": { pinId: "C4.2", offset: { x: 0, y: -0.55 }, side: "y-" },
  },
  netMap: {
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
    GND: { netId: "GND", isGround: true },
  },
  pinStrongConnMap: {
    "U1.1-C1.1": true,
    "C1.1-U1.1": true,
    "U1.2-C2.1": true,
    "C2.1-U1.2": true,
    "U1.3-C3.1": true,
    "C3.1-U1.3": true,
    "U1.4-C4.1": true,
    "C4.1-U1.4": true,
  },
  netConnMap: {
    "U1.1-VCC": true,
    "U1.2-VCC": true,
    "U1.3-VCC": true,
    "U1.4-VCC": true,
    "C1.1-VCC": true,
    "C2.1-VCC": true,
    "C3.1-VCC": true,
    "C4.1-VCC": true,
    "C1.2-GND": true,
    "C2.2-GND": true,
    "C3.2-GND": true,
    "C4.2-GND": true,
  },
  chipGap: 0.6,
  decouplingCapsGap: 0.2,
  partitionGap: 1.2,
}

test("Decoupling caps partition uses linear row layout instead of PackSolver2", () => {
  // Run the identify and partition phases to get a decoupling cap partition
  const identifySolver = new IdentifyDecouplingCapsSolver(decouplingCapProblem)
  identifySolver.solve()
  expect(identifySolver.solved).toBe(true)
  expect(identifySolver.outputDecouplingCapGroups.length).toBeGreaterThan(0)

  const partitionSolver = new ChipPartitionsSolver({
    inputProblem: decouplingCapProblem,
    decouplingCapGroups: identifySolver.outputDecouplingCapGroups,
  })
  partitionSolver.solve()
  expect(partitionSolver.solved).toBe(true)

  // Find the decoupling cap partition(s)
  const decapPartitions = partitionSolver.partitions.filter(
    (p) => (p as PartitionInputProblem).partitionType === "decoupling_caps",
  )
  expect(decapPartitions.length).toBeGreaterThan(0)

  const pinIdToStronglyConnectedPins =
    getPinIdToStronglyConnectedPinsObj(decouplingCapProblem)

  // Test each decoupling cap partition individually
  for (const partition of decapPartitions) {
    const solver = new SingleInnerPartitionPackingSolver({
      partitionInputProblem: partition as PartitionInputProblem,
      pinIdToStronglyConnectedPins,
    })
    solver.solve()
    expect(solver.solved).toBe(true)
    expect(solver.layout).toBeDefined()

    const capChipIds = Object.keys(partition.chipMap)
    expect(capChipIds.length).toBeGreaterThanOrEqual(2)

    // All caps should share the same Y coordinate (horizontal row)
    const placements = capChipIds.map(
      (id) => solver.layout!.chipPlacements[id]!,
    )
    const yValues = placements.map((p) => p.y)
    const firstY = yValues[0]!
    for (const y of yValues) {
      expect(y).toBeCloseTo(firstY, 6)
    }

    // All caps should have 0 rotation
    for (const placement of placements) {
      expect(placement.ccwRotationDegrees).toBe(0)
    }

    // Sort by X position to check spacing
    const sorted = capChipIds
      .map((id) => ({
        id,
        placement: solver.layout!.chipPlacements[id]!,
        chip: partition.chipMap[id]!,
      }))
      .sort((a, b) => a.placement.x - b.placement.x)

    // Check consistent gap between adjacent caps
    const expectedGap =
      (partition as PartitionInputProblem).decouplingCapsGap ??
      decouplingCapProblem.chipGap
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!
      const curr = sorted[i]!
      const edgeDist =
        curr.placement.x -
        curr.chip.size.x / 2 -
        (prev.placement.x + prev.chip.size.x / 2)
      expect(edgeDist).toBeCloseTo(expectedGap, 6)
    }
  }
})

test("Full pipeline produces linear decoupling cap layout", () => {
  const solver = new LayoutPipelineSolver(decouplingCapProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const outputLayout = solver.getOutputLayout()
  expect(outputLayout).toBeDefined()

  // Check that all chips have placements
  const chipIds = Object.keys(decouplingCapProblem.chipMap)
  for (const chipId of chipIds) {
    expect(outputLayout.chipPlacements[chipId]).toBeDefined()
  }

  // Find decoupling cap partitions from the pipeline
  const decapPartitions = solver.chipPartitionsSolver!.partitions.filter(
    (p) => (p as PartitionInputProblem).partitionType === "decoupling_caps",
  )
  expect(decapPartitions.length).toBeGreaterThan(0)

  // For each decoupling cap partition, verify the caps share the same Y
  // in the final layout (offset may differ from 0 due to partition packing)
  for (const partition of decapPartitions) {
    const capIds = Object.keys(partition.chipMap)
    const placements = capIds.map((id) => outputLayout.chipPlacements[id]!)
    const yValues = placements.map((p) => p.y)
    const firstY = yValues[0]!

    for (const y of yValues) {
      expect(y).toBeCloseTo(firstY, 6)
    }
  }

  // Verify visualization works
  const viz = solver.visualize()
  expect(viz).toBeDefined()
  expect(viz.rects?.length).toBeGreaterThan(0)
})

test("Linear layout centers row around origin", () => {
  const identifySolver = new IdentifyDecouplingCapsSolver(decouplingCapProblem)
  identifySolver.solve()

  const partitionSolver = new ChipPartitionsSolver({
    inputProblem: decouplingCapProblem,
    decouplingCapGroups: identifySolver.outputDecouplingCapGroups,
  })
  partitionSolver.solve()

  const decapPartitions = partitionSolver.partitions.filter(
    (p) => (p as PartitionInputProblem).partitionType === "decoupling_caps",
  )

  const pinIdToStronglyConnectedPins =
    getPinIdToStronglyConnectedPinsObj(decouplingCapProblem)

  for (const partition of decapPartitions) {
    const solver = new SingleInnerPartitionPackingSolver({
      partitionInputProblem: partition as PartitionInputProblem,
      pinIdToStronglyConnectedPins,
    })
    solver.solve()
    expect(solver.layout).toBeDefined()

    const chipIds = Object.keys(partition.chipMap)
    const placements = chipIds.map((id) => solver.layout!.chipPlacements[id]!)

    // Calculate bounding box
    const minX = Math.min(
      ...placements.map(
        (p, i) => p.x - partition.chipMap[chipIds[i]!]!.size.x / 2,
      ),
    )
    const maxX = Math.max(
      ...placements.map(
        (p, i) => p.x + partition.chipMap[chipIds[i]!]!.size.x / 2,
      ),
    )

    // Center should be approximately at x=0
    const centerX = (minX + maxX) / 2
    expect(centerX).toBeCloseTo(0, 4)
  }
})

test("Decoupling cap layout is deterministic (sorted by chipId)", () => {
  const identifySolver = new IdentifyDecouplingCapsSolver(decouplingCapProblem)
  identifySolver.solve()

  const partitionSolver = new ChipPartitionsSolver({
    inputProblem: decouplingCapProblem,
    decouplingCapGroups: identifySolver.outputDecouplingCapGroups,
  })
  partitionSolver.solve()

  const decapPartitions = partitionSolver.partitions.filter(
    (p) => (p as PartitionInputProblem).partitionType === "decoupling_caps",
  )

  const pinIdToStronglyConnectedPins =
    getPinIdToStronglyConnectedPinsObj(decouplingCapProblem)

  for (const partition of decapPartitions) {
    const solver = new SingleInnerPartitionPackingSolver({
      partitionInputProblem: partition as PartitionInputProblem,
      pinIdToStronglyConnectedPins,
    })
    solver.solve()

    const chipIds = Object.keys(partition.chipMap)
    const sorted = chipIds
      .map((id) => ({
        id,
        placement: solver.layout!.chipPlacements[id]!,
      }))
      .sort((a, b) => a.placement.x - b.placement.x)

    // The left-to-right order should match lexicographic sorting of chipIds
    const sortedById = [...chipIds].sort((a, b) => a.localeCompare(b))
    for (let i = 0; i < sorted.length; i++) {
      expect(sorted[i]!.id).toBe(sortedById[i]!)
    }
  }
})

test("Non-decoupling partitions still use PackSolver2", () => {
  const identifySolver = new IdentifyDecouplingCapsSolver(decouplingCapProblem)
  identifySolver.solve()

  const partitionSolver = new ChipPartitionsSolver({
    inputProblem: decouplingCapProblem,
    decouplingCapGroups: identifySolver.outputDecouplingCapGroups,
  })
  partitionSolver.solve()

  // Non-decap partitions should exist (the main chip U1 partition)
  const nonDecapPartitions = partitionSolver.partitions.filter(
    (p) => (p as PartitionInputProblem).partitionType !== "decoupling_caps",
  )
  expect(nonDecapPartitions.length).toBeGreaterThan(0)

  const pinIdToStronglyConnectedPins =
    getPinIdToStronglyConnectedPinsObj(decouplingCapProblem)

  for (const partition of nonDecapPartitions) {
    const solver = new SingleInnerPartitionPackingSolver({
      partitionInputProblem: partition as PartitionInputProblem,
      pinIdToStronglyConnectedPins,
    })
    solver.solve()
    expect(solver.solved).toBe(true)
    expect(solver.layout).toBeDefined()
  }
})
