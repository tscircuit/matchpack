import { expect, test } from "bun:test"
import {
  DecouplingCapRowSolver,
  canLayoutDecouplingCapRow,
} from "lib/solvers/PackInnerPartitionsSolver/DecouplingCapRowSolver"
import type { PartitionInputProblem } from "lib/types/InputProblem"
import { normalizeSide } from "lib/types/Side"

const makeProblem = (fixedChipIds: string[] = []): PartitionInputProblem => {
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

test("DecouplingCapRowSolver preserves one fixed cap as the rail-row anchor", () => {
  const problem = makeProblem(["C2"])
  // Use a non-origin anchor so an accidental recenter is easy to catch.
  problem.chipMap.C2!.fixedPosition = { x: 10, y: 5 }

  expect(canLayoutDecouplingCapRow(problem)).toBe(true)

  const solver = new DecouplingCapRowSolver({
    partitionInputProblem: problem,
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.layout).not.toBeNull()

  const placements = solver.layout!.chipPlacements
  expect(placements.C2).toEqual({
    x: 10,
    y: 5,
    ccwRotationDegrees: 0,
  })

  // The 1.0-wide caps use a 0.5 edge gap, so adjacent centers are 1.5 apart.
  expect(placements.C1!.x).toBeCloseTo(8.5)
  expect(placements.C3!.x).toBeCloseTo(11.5)

  // Every positive pin must land on the fixed cap's VCC rail at y=5.3.
  for (const chipId of ["C1", "C2", "C3"] as const) {
    expect(placements[chipId]!.y + 0.3).toBeCloseTo(5.3)
  }
})

test("DecouplingCapRowSolver falls back when multiple caps are fixed", () => {
  const problem = makeProblem(["C1", "C3"])

  expect(canLayoutDecouplingCapRow(problem)).toBe(false)
})
