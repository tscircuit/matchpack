import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import si7021InputProblem from "../../pages/repros/repro-si7021/si7021-matchpack-input.json"

const getPinPosition = (
  problem: InputProblem,
  placements: ReturnType<
    LayoutPipelineSolver["getOutputLayout"]
  >["chipPlacements"],
  chipId: string,
  pinId: string,
) => {
  const placement = placements[chipId]!
  const pinOffset = rotatePinOffset(
    problem.chipPinMap[pinId]!.offset,
    placement.ccwRotationDegrees,
  )
  return {
    x: placement.x + pinOffset.x,
    y: placement.y + pinOffset.y,
  }
}

test("repro si7021 I2C pull-up solder jumper layout", async () => {
  const problem = structuredClone(si7021InputProblem) as InputProblem
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const layout = solver.getOutputLayout()
  const placements = layout.chipPlacements
  expect(
    solver.packInnerPartitionsSolver?.completedSolvers[0]?.constructor.name,
  ).toBe("ParallelSeriesBranchSolver")

  // R1 (connected to higher pin U1.4) and R2 (connected to lower pin U1.3)
  // are placed side-by-side to the right of U1 and above U1's right-side pins,
  // with R1 closer to U1 so the connections from U1.4 and U1.3 do not cross.
  expect(placements.R1!.x).toBeGreaterThan(placements.U1!.x)
  expect(placements.R2!.x).toBeGreaterThan(placements.R1!.x)
  expect(placements.R1!.y).toBeCloseTo(placements.R2!.y)

  const u1Pin4 = getPinPosition(problem, placements, "U1", "U1.4")
  const r1NearPin = getPinPosition(problem, placements, "R1", "R1.1")
  const r1FarPin = getPinPosition(problem, placements, "R1", "R1.2")
  const r2NearPin = getPinPosition(problem, placements, "R2", "R2.1")
  const r2FarPin = getPinPosition(problem, placements, "R2", "R2.2")

  expect(r1NearPin.y).toBeGreaterThan(u1Pin4.y)
  expect(r1FarPin.y).toBeGreaterThan(r1NearPin.y)
  expect(r2FarPin.y).toBeGreaterThan(r2NearPin.y)
  expect(r1NearPin.y).toBeCloseTo(r2NearPin.y)
  expect(r1FarPin.y).toBeCloseTo(r2FarPin.y)

  // SJ1 bridges the tops of R1 and R2 with its V3_3 center pin pointing upward.
  expect(placements.SJ1!.x).toBeCloseTo(
    (placements.R1!.x + placements.R2!.x) / 2,
  )
  expect(placements.SJ1!.y).toBeGreaterThan(r1FarPin.y)
  const sj1SupplyPin = getPinPosition(problem, placements, "SJ1", "SJ1.2")
  const sj1BranchPin1 = getPinPosition(problem, placements, "SJ1", "SJ1.1")
  const sj1BranchPin3 = getPinPosition(problem, placements, "SJ1", "SJ1.3")
  expect(sj1SupplyPin.y).toBeGreaterThan(placements.SJ1!.y)
  expect(sj1BranchPin1.y).toBeCloseTo(sj1BranchPin3.y)

  expect(solver.checkForOverlaps(layout)).toHaveLength(0)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 600,
    svgHeight: 600,
  })
})

test("bridged parallel series branches do not depend on reference designators", () => {
  const raw = JSON.stringify(si7021InputProblem)
    .replaceAll("U1", "CHIP_MAIN")
    .replaceAll("C2", "PART_A")
    .replaceAll("R1", "PART_B")
    .replaceAll("R2", "PART_C")
    .replaceAll("SJ1", "PART_D")
  const problem = JSON.parse(raw) as InputProblem
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  const placements = solver.getOutputLayout().chipPlacements
  expect(placements.PART_B!.x).toBeGreaterThan(placements.CHIP_MAIN!.x)
  expect(placements.PART_C!.x).toBeGreaterThan(placements.PART_B!.x)
  expect(placements.PART_B!.y).toBeCloseTo(placements.PART_C!.y)
  expect(placements.PART_D!.x).toBeCloseTo(
    (placements.PART_B!.x + placements.PART_C!.x) / 2,
  )
  expect(placements.PART_D!.y).toBeGreaterThan(placements.PART_B!.y)
  expect(solver.checkForOverlaps(solver.getOutputLayout())).toHaveLength(0)
})

test("bridged parallel series branches bias downward when bridge supply pin connects to GND", () => {
  const problem = structuredClone(si7021InputProblem) as InputProblem
  delete problem.pinStrongConnMap["SJ1.2-V3_3"]
  delete problem.netConnMap["SJ1.2-V3_3"]
  problem.pinStrongConnMap["SJ1.2-GND"] = true
  problem.netConnMap["SJ1.2-GND"] = true
  problem.netMap.GND = { netId: "GND", isGround: true }

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  const layout = solver.getOutputLayout()
  const placements = layout.chipPlacements
  const u1Pin3 = getPinPosition(problem, placements, "U1", "U1.3")
  const r2NearPin = getPinPosition(problem, placements, "R2", "R2.1")
  const r2FarPin = getPinPosition(problem, placements, "R2", "R2.2")
  const sj1SupplyPin = getPinPosition(problem, placements, "SJ1", "SJ1.2")

  // Downward bias places the lower pin's branch (R2 on U1.3) closer to U1
  // and points the bridge's ground pin downward (-y).
  expect(placements.R2!.x).toBeGreaterThan(placements.U1!.x)
  expect(placements.R1!.x).toBeGreaterThan(placements.R2!.x)
  expect(r2NearPin.y).toBeLessThan(u1Pin3.y)
  expect(r2FarPin.y).toBeLessThan(r2NearPin.y)
  expect(placements.SJ1!.y).toBeLessThan(r2FarPin.y)
  expect(sj1SupplyPin.y).toBeLessThan(placements.SJ1!.y)
  expect(solver.checkForOverlaps(layout)).toHaveLength(0)
})

test("bridged parallel series branches mirror cleanly onto the left side of a main chip", () => {
  const problem = structuredClone(si7021InputProblem) as InputProblem
  for (const pin of Object.values(problem.chipPinMap)) {
    if (!pin.pinId.startsWith("U1.")) continue
    pin.offset.x = -pin.offset.x
    if (pin.side === "x+") pin.side = "x-"
    else if (pin.side === "x-") pin.side = "x+"
  }

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  const layout = solver.getOutputLayout()
  const placements = layout.chipPlacements
  const sj1SupplyPin = getPinPosition(problem, placements, "SJ1", "SJ1.2")

  // R1 (connected to higher pin U1.4) stays closer to U1 on the left side,
  // while R2 sits further left so horizontal leads do not cross.
  expect(placements.R1!.x).toBeLessThan(placements.U1!.x)
  expect(placements.R2!.x).toBeLessThan(placements.R1!.x)
  expect(placements.R1!.y).toBeCloseTo(placements.R2!.y)
  expect(placements.SJ1!.x).toBeCloseTo(
    (placements.R1!.x + placements.R2!.x) / 2,
  )
  expect(placements.SJ1!.y).toBeGreaterThan(placements.R1!.y)
  expect(sj1SupplyPin.y).toBeGreaterThan(placements.SJ1!.y)
  expect(solver.checkForOverlaps(layout)).toHaveLength(0)
})

test("bridged parallel series branches skip fixed-position components without overlaps", () => {
  const problem = structuredClone(si7021InputProblem) as InputProblem
  problem.chipMap.SJ1!.fixedPosition = {
    x: 0.025,
    y: -1.15,
  }

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  const layout = solver.getOutputLayout()
  expect(layout.chipPlacements.SJ1).toEqual({
    x: 0.025,
    y: -1.15,
    ccwRotationDegrees: 0,
  })
  expect(solver.checkForOverlaps(layout)).toHaveLength(0)
})
