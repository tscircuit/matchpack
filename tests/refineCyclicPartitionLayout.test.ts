import { expect, test } from "bun:test"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { LayoutPipelineSolver } from "../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { visualizeInputProblem } from "../lib/solvers/LayoutPipelineSolver/visualizeInputProblem"
import type { ChipPin, InputProblem } from "../lib/types/InputProblem"
import type { Placement } from "../lib/types/OutputLayout"
import { refineCyclicPartitionLayout } from "../lib/utils/refineCyclicPartitionLayout"
import { rotatePinOffset } from "../lib/utils/rotatePinOffset"
import fixture from "../pages/repros/repro-si7021/si7021-matchpack-input.json"

const problem = fixture as unknown as InputProblem
// Current PackSolver2 output for the original issue #11 reproduction.
const baseline: Record<string, Placement> = {
  U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
  SJ1: { x: 0.025, y: -1.15, ccwRotationDegrees: 90 },
  R2: { x: 1.025, y: -1.35, ccwRotationDegrees: 0 },
  R1: { x: 1.7, y: 0.15, ccwRotationDegrees: 0 },
  C2: { x: -2.03, y: 0, ccwRotationDegrees: 90 },
}
const connections = (input: InputProblem) => {
  const connected: Record<string, ChipPin[]> = {}
  for (const a of Object.values(input.chipPinMap)) {
    connected[a.pinId] = Object.values(input.chipPinMap).filter(
      (b) =>
        input.pinStrongConnMap[`${a.pinId}-${b.pinId}`] ||
        input.pinStrongConnMap[`${b.pinId}-${a.pinId}`],
    )
  }
  return connected
}
const run = (input = problem, placements = baseline) =>
  refineCyclicPartitionLayout({
    inputProblem: input,
    chipPlacements: placements,
    connectedPinsByPinId: connections(input),
  })
const wireLength = (
  input: InputProblem,
  placements: Record<string, Placement>,
) => {
  const positions = new Map<string, { x: number; y: number }>()
  for (const chip of Object.values(input.chipMap)) {
    for (const pinId of chip.pins) {
      const placement = placements[chip.chipId]!
      const offset = rotatePinOffset(
        input.chipPinMap[pinId]!.offset,
        placement.ccwRotationDegrees,
      )
      positions.set(pinId, {
        x: placement.x + offset.x,
        y: placement.y + offset.y,
      })
    }
  }
  let length = 0
  for (const [pin, others] of Object.entries(connections(input))) {
    for (const other of others) {
      if (pin >= other.pinId) continue
      const a = positions.get(pin)!
      const b = positions.get(other.pinId)!
      length += Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
    }
  }
  return length
}
const expectClearance = (placements: Record<string, Placement>) => {
  // Independent envelopes for this fixture, derived from its 0.1-wide pin pads.
  const sizes: Record<string, [number, number]> = {
    U1: [2.1, 0.8],
    C2: [0.53, 1.16],
    R1: [0.5, 1.1],
    R2: [0.5, 1.1],
    SJ1: [0.7, 0.7],
  }
  const entries = Object.entries(placements)
  for (let i = 0; i < entries.length; i++) {
    const [first, a] = entries[i]!
    const [aw, ah] =
      a.ccwRotationDegrees % 180 ? [...sizes[first]!].reverse() : sizes[first]!
    for (const [second, b] of entries.slice(i + 1)) {
      const [bw, bh] =
        b.ccwRotationDegrees % 180
          ? [...sizes[second]!].reverse()
          : sizes[second]!
      expect(
        Math.max(
          Math.abs(a.x - b.x) - (aw! + bw!) / 2,
          Math.abs(a.y - b.y) - (ah! + bh!) / 2,
        ),
      ).toBeGreaterThanOrEqual(problem.chipGap - 1e-8)
    }
  }
}

test("SI7021 cycle closes beside its anchor with shorter connections and pin clearance", () => {
  const before = structuredClone(baseline)
  const after = run()
  expect(wireLength(problem, baseline)).toBeCloseTo(5.9)
  expect(wireLength(problem, after)).toBeLessThanOrEqual(4)
  expect(after.SJ1!.x).toBeGreaterThan(after.R1!.x)
  expect(after.SJ1!.x).toBeGreaterThan(after.R2!.x)
  expect(after.U1).toEqual(baseline.U1)
  expect(after.C2).toEqual(baseline.C2)
  expectClearance(after)
  expect(baseline).toEqual(before)
  expect(run()).toEqual(after)
})

test("the complete pipeline preserves the improvement", async () => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  const result = solver.getOutputLayout()
  expect(wireLength(problem, result.chipPlacements)).toBeLessThanOrEqual(4)
  expectClearance(result.chipPlacements)
  expect(solver.checkForOverlaps(result)).toEqual([])
  await expect(
    getSvgFromGraphicsObject(
      visualizeInputProblem(problem, {
        chipPlacements: baseline,
        groupPlacements: {},
      }),
    ),
  ).toMatchSvgSnapshot(import.meta.path, "cyclic-partition-before")
  await expect(
    getSvgFromGraphicsObject(visualizeInputProblem(problem, result)),
  ).toMatchSvgSnapshot(import.meta.path, "cyclic-partition-after")
})

test("fixed placements and constrained rotations survive refinement", () => {
  const input = structuredClone(problem)
  input.chipMap.R1!.fixedPosition = { x: baseline.R1!.x, y: baseline.R1!.y }
  input.chipMap.R1!.availableRotations = [0]
  input.chipMap.R2!.availableRotations = [0]
  const after = run(input)
  expect(after.R1).toEqual(baseline.R1)
  expect(after.R2!.ccwRotationDegrees).toBe(0)
  expectClearance(after)
})

test("tree layouts and larger partitions are left to their existing solver", () => {
  const tree = structuredClone(problem)
  delete tree.pinStrongConnMap["SJ1.1-R2.2"]
  delete tree.pinStrongConnMap["R2.2-SJ1.1"]
  expect(run(tree)).toBe(baseline)
  const larger = structuredClone(problem)
  larger.chipMap.extra1 = { chipId: "extra1", size: { x: 1, y: 1 }, pins: [] }
  larger.chipMap.extra2 = { chipId: "extra2", size: { x: 1, y: 1 }, pins: [] }
  expect(run(larger)).toBe(baseline)
})

test("renaming the chips and pins does not require a topology-specific rule", () => {
  let serialized = JSON.stringify(problem)
  let initial = JSON.stringify(baseline)
  for (const [oldId, newId] of [
    ["U1", "anchor"],
    ["SJ1", "terminal"],
    ["R1", "upper"],
    ["R2", "lower"],
    ["C2", "branch"],
  ]) {
    serialized = serialized.replaceAll(oldId!, newId!)
    initial = initial.replaceAll(oldId!, newId!)
  }
  const input = JSON.parse(serialized) as InputProblem
  const after = run(input, JSON.parse(initial))
  expect(wireLength(input, after)).toBeLessThanOrEqual(4)
  expect(after.branch).toEqual(JSON.parse(initial).branch)
})
