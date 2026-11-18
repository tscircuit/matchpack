import { expect, test } from "bun:test"
import {
  canLayoutDecouplingCapRow,
  DecouplingCapRowSolver,
} from "../lib/solvers/PackInnerPartitionsSolver/DecouplingCapRowSolver"
import type { PartitionInputProblem } from "../lib/types/InputProblem"
import { rotatePinOffset } from "../lib/utils/rotatePinOffset"

const makeProblem = (
  rotations: Array<0 | 90 | 180 | 270> = [0, 180],
): PartitionInputProblem => {
  const problem: PartitionInputProblem = {
    partitionType: "decoupling_caps",
    chipMap: {},
    chipPinMap: {},
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.6,
    partitionGap: 1.2,
    decouplingCapsGap: 0.4,
  }
  for (const id of ["C1", "C2"]) {
    problem.chipMap[id] = {
      chipId: id,
      pins: [`${id}.1`, `${id}.2`],
      size: { x: 1, y: 0.4 },
      isCapacitor: true,
      availableRotations: [...rotations],
    }
    for (const pin of [1, 2]) {
      const pinId = `${id}.${pin}`
      problem.chipPinMap[pinId] = {
        pinId,
        offset: { x: 0, y: pin === 1 ? 0.3 : -0.3 },
        side: pin === 1 ? "y+" : "y-",
      }
      problem.netConnMap[
        `${pinId}-${(id === "C1") === (pin === 1) ? "VCC" : "GND"}`
      ] = true
    }
  }
  return problem
}

for (const rotations of [
  [0, 180],
  [90, 270],
] as const) {
  test(`aligns both rails with permitted rotations ${rotations}`, () => {
    const problem = makeProblem([...rotations])
    const original = JSON.stringify(problem)
    expect(canLayoutDecouplingCapRow(problem)).toBe(true)
    const solver = new DecouplingCapRowSolver({
      partitionInputProblem: problem,
    })
    solver.solve()
    const axis = rotations[0] === 0 ? "y" : "x"
    for (const net of ["VCC", "GND"]) {
      const positions = Object.values(problem.chipMap).map((chip) => {
        const pinId = chip.pins.find(
          (id) => problem.netConnMap[`${id}-${net}`],
        )!
        const placement = solver.layout!.chipPlacements[chip.chipId]!
        return (
          placement[axis] +
          rotatePinOffset(
            problem.chipPinMap[pinId]!.offset,
            placement.ccwRotationDegrees,
          )[axis]
        )
      })
      expect(positions[0]).toBeCloseTo(positions[1]!, 8)
    }
    expect(solver.layout!.chipPlacements.C1!.ccwRotationDegrees).toBe(
      rotations[0],
    )
    expect(solver.layout!.chipPlacements.C2!.ccwRotationDegrees).toBe(
      rotations[1],
    )
    expect(JSON.stringify(problem)).toBe(original)
    const rowAxis = axis === "y" ? "x" : "y"
    const placements = solver.layout!.chipPlacements
    expect(
      Math.abs(placements.C1![rowAxis] - placements.C2![rowAxis]) - 1,
    ).toBeCloseTo(0.4, 8)
  })
}

test("a later fixed rotation constrains earlier flexible capacitors", () => {
  const problem = makeProblem()
  problem.chipMap.C2!.availableRotations = [0]
  expect(canLayoutDecouplingCapRow(problem)).toBe(true)
  const solver = new DecouplingCapRowSolver({ partitionInputProblem: problem })
  solver.solve()
  expect(solver.layout!.chipPlacements.C1!.ccwRotationDegrees).toBe(180)
  expect(solver.layout!.chipPlacements.C2!.ccwRotationDegrees).toBe(0)
})

test("incompatible fixed polarities fall back to general packing", () => {
  expect(canLayoutDecouplingCapRow(makeProblem([0]))).toBe(false)
})

test("missing rail metadata preserves preferred rotations", () => {
  const problem = makeProblem()
  problem.netMap = {}
  const solver = new DecouplingCapRowSolver({ partitionInputProblem: problem })
  solver.solve()
  expect(solver.layout!.chipPlacements.C1!.ccwRotationDegrees).toBe(0)
  expect(solver.layout!.chipPlacements.C2!.ccwRotationDegrees).toBe(0)
})

test("already consistent polarity retains preferred rotations", () => {
  const problem = makeProblem()
  problem.netConnMap["C2.1-VCC"] = true
  problem.netConnMap["C2.2-GND"] = true
  problem.netConnMap["C2.1-GND"] = false
  problem.netConnMap["C2.2-VCC"] = false
  const solver = new DecouplingCapRowSolver({ partitionInputProblem: problem })
  solver.solve()
  expect(solver.layout!.chipPlacements.C1!.ccwRotationDegrees).toBe(0)
  expect(solver.layout!.chipPlacements.C2!.ccwRotationDegrees).toBe(0)
})
