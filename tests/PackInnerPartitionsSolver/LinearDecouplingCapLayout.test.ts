import { test, expect } from "bun:test"
import "bun-match-svg"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { IdentifyDecouplingCapsSolver } from "lib/solvers/IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import { ChipPartitionsSolver } from "lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import { SingleInnerPartitionPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import { getPinIdToStronglyConnectedPinsObj } from "lib/solvers/LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"
import { getExampleCircuitJson } from "../assets/RP2040Circuit"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import type { PartitionInputProblem } from "lib/types/InputProblem"

/**
 * Build the RP2040 problem with decoupling cap detection enabled.
 * Restricts capacitor rotations to [0] and sets net flags for
 * ground/voltage identification.
 */
function createRP2040Problem() {
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  // Restrict capacitor rotations to [0] (vertical only)
  for (const [chipId, chip] of Object.entries(problem.chipMap)) {
    if (/^C\d+$/.test(chipId)) {
      chip.availableRotations = [0]
    }
  }

  // Mark ground and positive voltage source nets
  if (problem.netMap["GND"]) {
    problem.netMap["GND"].isGround = true
  }
  if (problem.netMap["V3_3"]) {
    problem.netMap["V3_3"].isPositiveVoltageSource = true
  }
  if (problem.netMap["V1_1"]) {
    problem.netMap["V1_1"].isPositiveVoltageSource = true
  }

  // Propagate net membership through strong connections so the
  // IdentifyDecouplingCapsSolver can find net pairs for decoupling caps.
  // When a cap pin is strongly connected to a chip pin that has a net
  // connection, the cap pin should also be on that net.
  for (const [connKey, connected] of Object.entries(problem.pinStrongConnMap)) {
    if (!connected) continue
    const [pinA, pinB] = connKey.split("-")
    if (!pinA || !pinB) continue

    // Find nets for each pin
    for (const [netKey, netConnected] of Object.entries(problem.netConnMap)) {
      if (!netConnected) continue
      const [netPin, netId] = netKey.split("-")
      if (!netPin || !netId) continue

      // If pinA has a net, propagate to pinB
      if (netPin === pinA && !problem.netConnMap[`${pinB}-${netId}`]) {
        problem.netConnMap[`${pinB}-${netId}`] = true
      }
      // If pinB has a net, propagate to pinA
      if (netPin === pinB && !problem.netConnMap[`${pinA}-${netId}`]) {
        problem.netConnMap[`${pinA}-${netId}`] = true
      }
    }
  }

  problem.decouplingCapsGap = 0.2
  problem.partitionGap = 1.2

  return problem
}

test("Decoupling caps are arranged in a linear row via full pipeline", () => {
  const problem = createRP2040Problem()
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const outputLayout = solver.getOutputLayout()

  // Dynamically find decoupling cap partitions
  const decapPartitions = solver.chipPartitionsSolver!.partitions.filter(
    (p) => (p as PartitionInputProblem).partitionType === "decoupling_caps",
  )
  expect(decapPartitions.length).toBeGreaterThan(0)

  for (const partition of decapPartitions) {
    const capChipIds = Object.keys(partition.chipMap)
    expect(capChipIds.length).toBeGreaterThanOrEqual(2)

    // All caps in this partition should share the same Y coordinate
    const placements = capChipIds.map((id) => outputLayout.chipPlacements[id]!)
    const yValues = placements.map((p) => p.y)
    const firstY = yValues[0]!
    for (const y of yValues) {
      expect(y).toBeCloseTo(firstY, 6)
    }

    // Sort by X to check spacing
    const sorted = capChipIds
      .map((id) => ({
        id,
        placement: outputLayout.chipPlacements[id]!,
        chip: partition.chipMap[id]!,
      }))
      .sort((a, b) => a.placement.x - b.placement.x)

    // Check no overlaps and consistent gap
    const expectedGap = problem.decouplingCapsGap ?? problem.chipGap
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!
      const curr = sorted[i]!
      const edgeDistance =
        curr.placement.x -
        curr.chip.size.x / 2 -
        (prev.placement.x + prev.chip.size.x / 2)
      expect(edgeDistance).toBeCloseTo(expectedGap, 4)
    }
  }

  // Generate SVG snapshot of the full pipeline result
  const viz = solver.visualize()
  const svg = getSvgFromGraphicsObject(viz, { includeTextLabels: true })
  expect(svg).toMatchSvgSnapshot(import.meta.path, "full-pipeline-layout")
})

test("SingleInnerPartitionPackingSolver arranges decoupling caps linearly", () => {
  const problem = createRP2040Problem()

  // Run identification and partitioning to get a decoupling_caps partition
  const decapSolver = new IdentifyDecouplingCapsSolver(problem)
  decapSolver.solve()
  expect(decapSolver.solved).toBe(true)
  expect(decapSolver.outputDecouplingCapGroups.length).toBeGreaterThan(0)

  const partitionSolver = new ChipPartitionsSolver({
    inputProblem: problem,
    decouplingCapGroups: decapSolver.outputDecouplingCapGroups,
  })
  partitionSolver.solve()
  expect(partitionSolver.solved).toBe(true)

  const decapPartition = partitionSolver.partitions.find(
    (p) => (p as PartitionInputProblem).partitionType === "decoupling_caps",
  ) as PartitionInputProblem
  expect(decapPartition).toBeDefined()

  const pinIdToStronglyConnectedPins =
    getPinIdToStronglyConnectedPinsObj(problem)

  // Solve just this partition
  const packSolver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: decapPartition,
    pinIdToStronglyConnectedPins,
  })
  packSolver.solve()

  expect(packSolver.solved).toBe(true)
  expect(packSolver.layout).not.toBeNull()

  const layout = packSolver.layout!
  const chipIds = Object.keys(decapPartition.chipMap)

  // All Y coordinates should be 0 (centered horizontal row)
  for (const chipId of chipIds) {
    const placement = layout.chipPlacements[chipId]!
    expect(placement.y).toBe(0)
    expect(placement.ccwRotationDegrees).toBe(0)
  }

  // Check linear arrangement: sorted by X, evenly spaced
  const sorted = chipIds
    .map((id) => ({
      id,
      x: layout.chipPlacements[id]!.x,
      width: decapPartition.chipMap[id]!.size.x,
    }))
    .sort((a, b) => a.x - b.x)

  const expectedGap = decapPartition.decouplingCapsGap ?? decapPartition.chipGap
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const curr = sorted[i]!
    const edgeDistance = curr.x - curr.width / 2 - (prev.x + prev.width / 2)
    expect(edgeDistance).toBeCloseTo(expectedGap, 4)
  }

  // Generate SVG snapshot of the partition layout
  const viz = packSolver.visualize()
  const svg = getSvgFromGraphicsObject(viz, { includeTextLabels: true })
  expect(svg).toMatchSvgSnapshot(import.meta.path, "decoupling-cap-partition")
})
