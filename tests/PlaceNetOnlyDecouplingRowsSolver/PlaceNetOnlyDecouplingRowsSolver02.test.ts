import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import {
  canLayoutDecouplingCapRow,
  DecouplingCapRowSolver,
} from "lib/solvers/PackInnerPartitionsSolver/DecouplingCapRowSolver"
import type {
  InputProblem,
  PartitionInputProblem,
} from "lib/types/InputProblem"
import { normalizeSide } from "lib/types/Side"

const makePartitionProblem = (
  fixedChipIds: string[] = [],
): PartitionInputProblem => {
  const problem: PartitionInputProblem = {
    isPartition: true,
    partitionType: "decoupling_caps",
    chipMap: {},
    chipPinMap: {},
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.4,
    decouplingCapsGap: 0.5,
    partitionGap: 1,
    decouplingMainChipSide: "x+",
  }

  for (const [index, chipId] of ["C1", "C2", "C3"].entries()) {
    const positivePinId = `${chipId}.1`
    const groundPinId = `${chipId}.2`
    problem.chipMap[chipId] = {
      chipId,
      pins: [positivePinId, groundPinId],
      size: { x: 1, y: 0.6 },
      availableRotations: [0],
      ...(fixedChipIds.includes(chipId) && {
        fixedPosition: { x: 10 + index, y: 5 + index },
      }),
    }
    problem.chipPinMap[positivePinId] = {
      pinId: positivePinId,
      offset: { x: 0, y: 0.3 },
      side: normalizeSide("top"),
    }
    problem.chipPinMap[groundPinId] = {
      pinId: groundPinId,
      offset: { x: 0, y: -0.3 },
      side: normalizeSide("bottom"),
    }
    problem.netConnMap[`${positivePinId}-VCC`] = true
    problem.netConnMap[`${groundPinId}-GND`] = true
  }

  return problem
}

test("DecouplingCapRowSolver preserves one fixed cap as the rail-row anchor and rejects multiple fixed caps", () => {
  const problem = makePartitionProblem(["C2"])
  problem.chipMap.C2!.fixedPosition = { x: 10, y: 5 }

  expect(canLayoutDecouplingCapRow(problem)).toBe(true)

  const solver = new DecouplingCapRowSolver({
    partitionInputProblem: problem,
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const placements = solver.layout!.chipPlacements
  expect(placements.C2).toEqual({
    x: 10,
    y: 5,
    ccwRotationDegrees: 0,
  })
  expect(placements.C1!.x).toBeCloseTo(8.5)
  expect(placements.C3!.x).toBeCloseTo(11.5)
  for (const chipId of ["C1", "C2", "C3"] as const) {
    expect(placements[chipId]!.y + 0.3).toBeCloseTo(5.3)
  }

  const multiFixedProblem = makePartitionProblem(["C1", "C3"])
  expect(canLayoutDecouplingCapRow(multiFixedProblem)).toBe(false)
})

test("PlaceNetOnlyDecouplingRowsSolver aligns net-only decoupling rows on y+ and y- sides and preserves fixedPosition", () => {
  const makePipelineProblem = (
    powerSide: "y+" | "y-",
    fixedC2?: { x: number; y: number },
  ): InputProblem => ({
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.vcc", "U1.gnd", "U1.io"],
        size: { x: 2.4, y: 2.0 },
        availableRotations: [0],
      },
      C1: {
        chipId: "C1",
        pins: ["C1.1", "C1.2"],
        size: { x: 0.8, y: 0.6 },
        isCapacitor: true,
        availableRotations: [0],
      },
      C2: {
        chipId: "C2",
        pins: ["C2.1", "C2.2"],
        size: { x: 0.8, y: 0.6 },
        isCapacitor: true,
        availableRotations: [0],
        ...(fixedC2 && { fixedPosition: fixedC2 }),
      },
    },
    chipPinMap: {
      "U1.vcc": {
        pinId: "U1.vcc",
        offset: { x: 0.4, y: powerSide === "y+" ? 1.0 : -1.0 },
        side: powerSide,
      },
      "U1.gnd": {
        pinId: "U1.gnd",
        offset: { x: -1.2, y: 0 },
        side: "x-",
      },
      "U1.io": {
        pinId: "U1.io",
        offset: { x: 1.2, y: 0 },
        side: "x+",
      },
      "C1.1": {
        pinId: "C1.1",
        offset: { x: 0, y: 0.3 },
        side: "y+",
      },
      "C1.2": {
        pinId: "C1.2",
        offset: { x: 0, y: -0.3 },
        side: "y-",
      },
      "C2.1": {
        pinId: "C2.1",
        offset: { x: 0, y: 0.3 },
        side: "y+",
      },
      "C2.2": {
        pinId: "C2.2",
        offset: { x: 0, y: -0.3 },
        side: "y-",
      },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "U1.vcc-VCC": true,
      "U1.gnd-GND": true,
      "C1.1-VCC": true,
      "C1.2-GND": true,
      "C2.1-VCC": true,
      "C2.2-GND": true,
    },
    chipGap: 0.4,
    decouplingCapsGap: 0.4,
    partitionGap: 1.0,
  })

  const topSolver = new LayoutPipelineSolver(makePipelineProblem("y+"))
  topSolver.solve()
  const topLayout = topSolver.getOutputLayout()
  expect(topLayout.chipPlacements.C1!.y).toBeGreaterThan(
    topLayout.chipPlacements.U1!.y,
  )
  expect(topLayout.chipPlacements.C1!.y).toBeCloseTo(
    topLayout.chipPlacements.C2!.y,
  )
  expect(topSolver.checkForOverlaps(topLayout)).toEqual([])

  const bottomSolver = new LayoutPipelineSolver(makePipelineProblem("y-"))
  bottomSolver.solve()
  const bottomLayout = bottomSolver.getOutputLayout()
  expect(bottomLayout.chipPlacements.C1!.y).toBeLessThan(
    bottomLayout.chipPlacements.U1!.y,
  )
  expect(bottomLayout.chipPlacements.C1!.y).toBeCloseTo(
    bottomLayout.chipPlacements.C2!.y,
  )
  expect(bottomSolver.checkForOverlaps(bottomLayout)).toEqual([])
})
