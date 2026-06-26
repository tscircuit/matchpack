import { expect, test } from "bun:test"
import { DecouplingCapBankLayoutSolver } from "lib/solvers/PackInnerPartitionsSolver/DecouplingCapBankLayoutSolver"
import type { PartitionInputProblem } from "lib/types/InputProblem"

const makeProblem = (
  capCount: number,
  pin1IsGnd = false,
): PartitionInputProblem => {
  const chipMap: PartitionInputProblem["chipMap"] = {}
  const chipPinMap: PartitionInputProblem["chipPinMap"] = {}
  const netConnMap: PartitionInputProblem["netConnMap"] = {}

  for (let i = 1; i <= capCount; i++) {
    const cid = `C${i}`
    const p1 = `${cid}_P1`
    const p2 = `${cid}_P2`
    chipMap[cid] = {
      chipId: cid,
      pins: [p1, p2],
      size: { x: 0.53, y: 1.1 },
      isDecouplingCap: true,
    }
    chipPinMap[p1] = { pinId: p1, offset: { x: 0, y: 0.55 }, side: "top" }
    chipPinMap[p2] = { pinId: p2, offset: { x: 0, y: -0.55 }, side: "bottom" }
    netConnMap[`${p1}-${pin1IsGnd ? "GND" : "VCC"}`] = true
    netConnMap[`${p2}-${pin1IsGnd ? "VCC" : "GND"}`] = true
  }

  return {
    partitionType: "decoupling_caps",
    chipMap,
    chipPinMap,
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap,
    chipGap: 0.2,
    partitionGap: 2,
    decouplingCapsGap: 0.1,
  }
}

test("places 3 caps in a single row with correct pitch", () => {
  const solver = new DecouplingCapBankLayoutSolver(makeProblem(3))
  solver.solve()
  expect(solver.solved).toBe(true)
  const placements = solver.layout!.chipPlacements
  const pitch = 0.53 + 0.1
  expect(placements["C1"]!.x).toBeCloseTo(0)
  expect(placements["C2"]!.x).toBeCloseTo(pitch)
  expect(placements["C3"]!.x).toBeCloseTo(2 * pitch)
  // all in same row
  expect(placements["C1"]!.y).toBeCloseTo(0)
  expect(placements["C2"]!.y).toBeCloseTo(0)
  expect(placements["C3"]!.y).toBeCloseTo(0)
})

test("caps with VCC on pin1 have 0° rotation", () => {
  const solver = new DecouplingCapBankLayoutSolver(makeProblem(2, false))
  solver.solve()
  const p = solver.layout!.chipPlacements
  expect(p["C1"]!.ccwRotationDegrees).toBe(0)
  expect(p["C2"]!.ccwRotationDegrees).toBe(0)
})

test("caps with GND on pin1 are rotated 180°", () => {
  const solver = new DecouplingCapBankLayoutSolver(makeProblem(2, true))
  solver.solve()
  const p = solver.layout!.chipPlacements
  expect(p["C1"]!.ccwRotationDegrees).toBe(180)
  expect(p["C2"]!.ccwRotationDegrees).toBe(180)
})

test("wraps into two rows when more than 8 caps", () => {
  const solver = new DecouplingCapBankLayoutSolver(makeProblem(10))
  solver.solve()
  expect(solver.solved).toBe(true)
  const p = solver.layout!.chipPlacements
  // First 8 caps in row 0 (y=0), caps 9-10 in row 1 (y negative)
  expect(p["C1"]!.y).toBeCloseTo(0)
  expect(p["C8"]!.y).toBeCloseTo(0)
  const rowPitch = 1.1 + 0.1
  expect(p["C9"]!.y).toBeCloseTo(-rowPitch)
  expect(p["C10"]!.y).toBeCloseTo(-rowPitch)
  // Row 1 starts at col 0
  expect(p["C9"]!.x).toBeCloseTo(0)
})

test("empty partition produces empty layout", () => {
  const solver = new DecouplingCapBankLayoutSolver({
    partitionType: "decoupling_caps",
    chipMap: {},
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  })
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(Object.keys(solver.layout!.chipPlacements).length).toBe(0)
})
