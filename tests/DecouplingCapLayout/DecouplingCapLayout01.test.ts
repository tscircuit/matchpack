import { test, expect } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../../lib/types/InputProblem"
import { normalizeSide } from "../../lib/types/Side"

test("DecouplingCapLayout01 - decoupling caps are placed in a horizontal row", () => {
  // Build a decoupling_caps partition with 4 caps of known sizes
  const problem: PartitionInputProblem = {
    isPartition: true,
    partitionType: "decoupling_caps",
    chipMap: {
      C1: {
        chipId: "C1",
        pins: ["C1_P1", "C1_P2"],
        size: { x: 1.0, y: 0.5 },
        availableRotations: [0, 180],
      },
      C2: {
        chipId: "C2",
        pins: ["C2_P1", "C2_P2"],
        size: { x: 1.0, y: 0.5 },
        availableRotations: [0, 180],
      },
      C3: {
        chipId: "C3",
        pins: ["C3_P1", "C3_P2"],
        size: { x: 1.0, y: 0.5 },
        availableRotations: [0, 180],
      },
      C4: {
        chipId: "C4",
        pins: ["C4_P1", "C4_P2"],
        size: { x: 1.0, y: 0.5 },
        availableRotations: [0, 180],
      },
    },
    chipPinMap: {
      C1_P1: {
        pinId: "C1_P1",
        offset: { x: 0, y: 0.25 },
        side: normalizeSide("top"),
      },
      C1_P2: {
        pinId: "C1_P2",
        offset: { x: 0, y: -0.25 },
        side: normalizeSide("bottom"),
      },
      C2_P1: {
        pinId: "C2_P1",
        offset: { x: 0, y: 0.25 },
        side: normalizeSide("top"),
      },
      C2_P2: {
        pinId: "C2_P2",
        offset: { x: 0, y: -0.25 },
        side: normalizeSide("bottom"),
      },
      C3_P1: {
        pinId: "C3_P1",
        offset: { x: 0, y: 0.25 },
        side: normalizeSide("top"),
      },
      C3_P2: {
        pinId: "C3_P2",
        offset: { x: 0, y: -0.25 },
        side: normalizeSide("bottom"),
      },
      C4_P1: {
        pinId: "C4_P1",
        offset: { x: 0, y: 0.25 },
        side: normalizeSide("top"),
      },
      C4_P2: {
        pinId: "C4_P2",
        offset: { x: 0, y: -0.25 },
        side: normalizeSide("bottom"),
      },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "C1_P1-VCC": true,
      "C1_P2-GND": true,
      "C2_P1-VCC": true,
      "C2_P2-GND": true,
      "C3_P1-VCC": true,
      "C3_P2-GND": true,
      "C4_P1-VCC": true,
      "C4_P2-GND": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  solver.solve()

  // (a) solver completes successfully
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.layout).not.toBeNull()

  const placements = solver.layout!.chipPlacements

  // (b) all four chips have placements
  expect(Object.keys(placements)).toHaveLength(4)

  // (c) all chips are on y === 0 (horizontal row)
  for (const chipId of ["C1", "C2", "C3", "C4"]) {
    expect(placements[chipId]).toBeDefined()
    expect(placements[chipId]!.y).toBe(0)
  }

  // (d) chips are sorted by chipId (C1 < C2 < C3 < C4) — x values strictly increasing
  expect(placements["C1"]!.x).toBeLessThan(placements["C2"]!.x)
  expect(placements["C2"]!.x).toBeLessThan(placements["C3"]!.x)
  expect(placements["C3"]!.x).toBeLessThan(placements["C4"]!.x)

  // (e) no bounding-box overlaps (chips are 1.0 wide, gap 0.2 → centers spaced 1.2 apart)
  const gap = 0.2
  const chipWidth = 1.0
  const expectedSpacing = chipWidth + gap
  expect(placements["C2"]!.x - placements["C1"]!.x).toBeCloseTo(
    expectedSpacing,
    5,
  )
  expect(placements["C3"]!.x - placements["C2"]!.x).toBeCloseTo(
    expectedSpacing,
    5,
  )
  expect(placements["C4"]!.x - placements["C3"]!.x).toBeCloseTo(
    expectedSpacing,
    5,
  )
})
