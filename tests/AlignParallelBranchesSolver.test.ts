import { expect, test } from "bun:test"
import inputData from "../pages/repros/repro-si7021/si7021-matchpack-input.json"
import type { InputProblem } from "../lib/types/InputProblem"
import type { OutputLayout } from "../lib/types/OutputLayout"
import { alignParallelBranches } from "../lib/solvers/AlignParallelBranchesSolver/alignParallelBranches"
import { LayoutPipelineSolver } from "../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { placementsOverlap } from "../lib/solvers/AlignTestPointsSolver/placementsOverlap"
import { rotatePinOffset } from "../lib/utils/rotatePinOffset"

const input = () => structuredClone(inputData) as InputProblem
const initial: OutputLayout = {
  chipPlacements: {
    U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
    C2: { x: -2.03, y: 0, ccwRotationDegrees: 90 },
    R1: { x: 1.7, y: 0.15, ccwRotationDegrees: 0 },
    R2: { x: 1.025, y: -1.35, ccwRotationDegrees: 0 },
    SJ1: { x: 0.025, y: -1.15, ccwRotationDegrees: 90 },
  },
  groupPlacements: {},
}
function expectClear(problem: InputProblem, layout: OutputLayout) {
  const entries = Object.entries(layout.chipPlacements)
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      const [chipIdA, placementA] = entries[i]!
      const [chipIdB, placementB] = entries[j]!
      expect(
        placementsOverlap({
          inputProblem: problem,
          chipIdA,
          placementA,
          chipIdB,
          placementB,
        }),
      ).toBe(false)
    }
}

test("SI7021 branches form a parallel row with the shared bridge beyond them", () => {
  const problem = input()
  const before = structuredClone(initial)
  const result = alignParallelBranches(problem, initial)
  const { U1, C2, R1, R2, SJ1 } = result.chipPlacements
  expect(U1).toEqual(initial.chipPlacements.U1)
  expect(C2).toEqual(initial.chipPlacements.C2)
  expect(R1!.y).toBeCloseTo(R2!.y, 8)
  expect(R1!.x).toBeLessThan(R2!.x)
  expect(R1!.x).toBeGreaterThan(U1!.x + 1)
  expect(SJ1!.y).toBeGreaterThan(R1!.y + 0.8)
  expect(SJ1!.x).toBeGreaterThan(R1!.x)
  expect(SJ1!.x).toBeLessThan(R2!.x)
  expectClear(problem, result)
  expect(initial).toEqual(before)
  expect(problem).toEqual(input())
  expect(alignParallelBranches(problem, result)).toEqual(result)
})

for (const rotation of [90, 180, 270])
  test(`layout is equivariant under ${rotation}-degree anchor rotation`, () => {
    const problem = input()
    const rotated = structuredClone(initial)
    for (const placement of Object.values(rotated.chipPlacements)) {
      const point = rotatePinOffset(placement, rotation)
      Object.assign(placement, point, {
        ccwRotationDegrees: (placement.ccwRotationDegrees + rotation) % 360,
      })
    }
    const normal = alignParallelBranches(problem, initial)
    const result = alignParallelBranches(problem, rotated)
    for (const [id, placement] of Object.entries(normal.chipPlacements)) {
      const expected = rotatePinOffset(placement, rotation)
      expect(result.chipPlacements[id]!.x).toBeCloseTo(expected.x, 7)
      expect(result.chipPlacements[id]!.y).toBeCloseTo(expected.y, 7)
      expect(result.chipPlacements[id]!.ccwRotationDegrees).toBe(
        (placement.ccwRotationDegrees + rotation) % 360,
      )
    }
    expectClear(problem, result)
  })

test("recognition is independent of chip and pin identifiers, including hyphens", () => {
  const renamedText = JSON.stringify({ problem: input(), layout: initial })
    .replaceAll("SJ1", "bridge-x")
    .replaceAll("R1", "branch-a")
    .replaceAll("R2", "branch-b")
    .replaceAll("U1", "anchor-x")
    .replaceAll("C2", "other-x")
  const { problem, layout } = JSON.parse(renamedText)
  const result = alignParallelBranches(problem, layout)
  expect(result.chipPlacements["branch-a"]!.y).toBeCloseTo(
    result.chipPlacements["branch-b"]!.y,
    8,
  )
  expect(result.chipPlacements["bridge-x"]!.y).toBeGreaterThan(
    result.chipPlacements["branch-a"]!.y,
  )
})

for (const id of ["R1", "R2", "SJ1"])
  test(`fixed ${id} keeps the entire connected motif unchanged`, () => {
    const problem = input()
    problem.chipMap[id]!.fixedPosition = {
      x: initial.chipPlacements[id]!.x,
      y: initial.chipPlacements[id]!.y,
    }
    expect(alignParallelBranches(problem, initial)).toEqual(initial)
  })

test("a fixed anchor is preserved while its movable branches can be aligned", () => {
  const problem = input()
  problem.chipMap.U1!.fixedPosition = { x: 0, y: 0 }
  const result = alignParallelBranches(problem, initial)
  expect(result.chipPlacements.U1).toEqual(initial.chipPlacements.U1)
  expect(result.chipPlacements.R1!.y).toBeCloseTo(
    result.chipPlacements.R2!.y,
    8,
  )
})

test("unavailable bridge orientations leave the motif unchanged", () => {
  const problem = input()
  problem.chipMap.SJ1!.availableRotations = [90, 270]
  expect(alignParallelBranches(problem, initial)).toEqual(initial)
})

test("available branch rotations can select the lower row", () => {
  const problem = input()
  problem.chipMap.R1!.availableRotations = [0]
  problem.chipMap.R2!.availableRotations = [0]
  const result = alignParallelBranches(problem, initial)
  expect(result.chipPlacements.R1!.ccwRotationDegrees).toBe(0)
  expect(result.chipPlacements.R2!.ccwRotationDegrees).toBe(0)
  expect(result.chipPlacements.SJ1!.y).toBeLessThan(result.chipPlacements.R1!.y)
  expectClear(problem, result)
})

test("obstacles cause a clear alternative or an atomic unchanged fallback", () => {
  const problem = input()
  problem.chipMap.wall = {
    chipId: "wall",
    pins: [],
    size: { x: 10, y: 5 },
    fixedPosition: { x: 3, y: 3.5 },
  }
  const layout = structuredClone(initial)
  layout.chipPlacements.wall = { x: 3, y: 3.5, ccwRotationDegrees: 0 }
  const result = alignParallelBranches(problem, layout)
  expect(result.chipPlacements.wall).toEqual(layout.chipPlacements.wall)
  expect(result.chipPlacements.SJ1!.y).toBeLessThan(result.chipPlacements.R1!.y)
  problem.chipMap.wall!.size.y = 20
  expect(alignParallelBranches(problem, layout)).toEqual(layout)
})

test("extra strong bridge connections and unrelated layouts remain unchanged", () => {
  const problem = input()
  problem.pinStrongConnMap["SJ1.3-U1.2"] = true
  expect(alignParallelBranches(problem, initial)).toEqual(initial)
  delete problem.pinStrongConnMap["SJ1.3-U1.2"]
  delete problem.pinStrongConnMap["SJ1.3-R1.2"]
  expect(alignParallelBranches(problem, initial)).toEqual(initial)
})

test("full pipeline applies the pass to the original issue fixture", () => {
  const solver = new LayoutPipelineSolver(input())
  solver.solve()
  expect(solver.solved).toBe(true)
  const result = solver.getOutputLayout()
  expect(result.chipPlacements.R1!.y).toBeCloseTo(
    result.chipPlacements.R2!.y,
    8,
  )
  expect(result.chipPlacements.SJ1!.y).toBeGreaterThan(
    result.chipPlacements.R1!.y,
  )
  expectClear(input(), result)
})
