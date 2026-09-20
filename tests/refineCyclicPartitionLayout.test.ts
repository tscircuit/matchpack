import blockerFixture from "./assets/cyclic-partition-with-blocker.json"
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
const connectionLengths = (
  input: InputProblem,
  placements: Record<string, Placement>,
  extension = 0,
) => {
  const normals = {
    "x-": { x: -1, y: 0 },
    "x+": { x: 1, y: 0 },
    "y-": { x: 0, y: -1 },
    "y+": { x: 0, y: 1 },
  }
  const positions = new Map<string, { x: number; y: number }>()
  for (const chip of Object.values(input.chipMap)) {
    for (const pinId of chip.pins) {
      const placement = placements[chip.chipId]!
      const pin = input.chipPinMap[pinId]!
      const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
      const normal = rotatePinOffset(
        normals[pin.side],
        placement.ccwRotationDegrees,
      )
      positions.set(pinId, {
        x: placement.x + offset.x + extension * normal.x,
        y: placement.y + offset.y + extension * normal.y,
      })
    }
  }
  const lengths: number[] = []
  for (const [pin, others] of Object.entries(connections(input))) {
    for (const other of others) {
      if (pin >= other.pinId) continue
      const a = positions.get(pin)!
      const b = positions.get(other.pinId)!
      lengths.push(2 * extension + Math.abs(a.x - b.x) + Math.abs(a.y - b.y))
    }
  }
  return lengths
}
const wireLength = (
  input: InputProblem,
  placements: Record<string, Placement>,
) =>
  connectionLengths(input, placements).reduce((sum, length) => sum + length, 0)
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

test("SI7021 refinement balances the two branches and centers the shared terminal", () => {
  const after = run()
  expect(after.R1!.y).toBeCloseTo(0.45)
  expect(after.R2!.y).toBeCloseTo(-0.45)
  expect(after.SJ1!.y).toBeCloseTo(0)
  expect(Math.max(...connectionLengths(problem, after))).toBeCloseTo(0.95)
  expect(
    connectionLengths(problem, after, problem.chipGap / 2).reduce(
      (sum, length) => sum + length,
      0,
    ),
  ).toBeCloseTo(4.1)
  // With the declared 0.4 clearance, the terminal connections are 0.95 each.
  expect(
    Math.abs(after.R1!.y - (after.SJ1!.y + 0.3)) +
      Math.abs(after.R1!.x + 0.5 - after.SJ1!.x),
  ).toBeCloseTo(0.95)
  expectClearance(after)
})

const makeRing = (count: number) => {
  const input: InputProblem = {
    chipMap: {},
    chipPinMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    netMap: {},
    chipGap: 0.4,
    partitionGap: 1.2,
  }
  const placements: Record<string, Placement> = {}
  for (let i = 0; i < count; i++) {
    const id = `node${i}`
    const anchor = i === 0
    const pins = [`${id}.in`, `${id}.out`]
    input.chipMap[id] = {
      chipId: id,
      pins,
      size: anchor ? { x: 2, y: 2 } : { x: 0.5, y: 1 },
      availableRotations: anchor ? [0] : [0, 90],
      ...(anchor ? { fixedPosition: { x: 0, y: 0 } } : {}),
    }
    input.chipPinMap[pins[0]!] = {
      pinId: pins[0]!,
      offset: anchor ? { x: 1.2, y: 0.4 } : { x: 0, y: 0.5 },
      side: anchor ? "x+" : "y+",
    }
    input.chipPinMap[pins[1]!] = {
      pinId: pins[1]!,
      offset: anchor ? { x: 1.2, y: -0.4 } : { x: 0, y: -0.5 },
      side: anchor ? "x+" : "y-",
    }
    placements[id] = {
      x: anchor ? 0 : 2 + i * 2,
      y: anchor ? 0 : 3,
      ccwRotationDegrees: 0,
    }
  }
  for (let i = 0; i < count; i++) {
    const a = `node${i}.out`
    const b = `node${(i + 1) % count}.in`
    input.pinStrongConnMap[`${a}-${b}`] = true
    input.pinStrongConnMap[`${b}-${a}`] = true
  }
  return { input, placements }
}

for (const count of [3, 6]) {
  test(`refines a ${count}-component ring without a shared-terminal topology`, () => {
    const { input, placements } = makeRing(count)
    const after = run(input, placements)
    expect(wireLength(input, after)).toBeLessThan(
      wireLength(input, placements) * 0.8,
    )
    expect(after.node0).toEqual(placements.node0)
    const entries = Object.entries(after)
    for (let i = 0; i < entries.length; i++) {
      const [id, a] = entries[i]!
      expect(
        input.chipMap[id]!.availableRotations!.some(
          (rotation) => rotation === a.ccwRotationDegrees,
        ),
      ).toBe(true)
      for (const [otherId, b] of entries.slice(i + 1)) {
        // This ring's anchor has asymmetric right-facing pins; use its actual
        // envelope [-1, 1.25] x [-1, 1], not just the centered body dimensions.
        const envelope = (id: string, p: Placement) => {
          if (id === "node0")
            return {
              left: p.x - 1,
              right: p.x + 1.25,
              bottom: p.y - 1,
              top: p.y + 1,
            }
          const [w, h] = p.ccwRotationDegrees === 90 ? [1.1, 0.5] : [0.5, 1.1]
          return {
            left: p.x - w! / 2,
            right: p.x + w! / 2,
            bottom: p.y - h! / 2,
            top: p.y + h! / 2,
          }
        }
        const aa = envelope(id, a),
          bb = envelope(otherId, b)
        expect(
          Math.max(
            bb.left - aa.right,
            aa.left - bb.right,
            bb.bottom - aa.top,
            aa.bottom - bb.top,
          ),
        ).toBeGreaterThanOrEqual(input.chipGap - 1e-8)
      }
    }
  })
}

test("refines the original cycle after rotating its starting layout by a quarter turn", () => {
  const rotated = Object.fromEntries(
    Object.entries(baseline).map(([id, placement]) => [
      id,
      {
        x: -placement.y,
        y: placement.x,
        ccwRotationDegrees: (placement.ccwRotationDegrees + 90) % 360,
      },
    ]),
  )
  const after = run(problem, rotated)
  expect(wireLength(problem, after)).toBeLessThanOrEqual(4)
  expect(after.U1).toEqual(rotated.U1)
  expect(after.C2).toEqual(rotated.C2)
  expectClearance(after)
})

test("rounding-sized input changes do not send the search into a worse topology", () => {
  const rounded = structuredClone(baseline)
  // Coordinates emitted by the packer differ from the rounded fixture by a
  // few ulps. Previously those differences changed random-number consumption.
  rounded.SJ1!.x = 0.025000000000000133
  rounded.SJ1!.y = -1.1500000000000001
  rounded.R1!.x = 1.7000000000000002
  rounded.R1!.y = 0.15000000000000024
  rounded.R2!.x = 1.0250000000000001
  rounded.R2!.y = -1.3499999999999999
  rounded.C2!.x = -2.0300000000000002
  const after = run(problem, rounded)
  expect(wireLength(problem, after)).toBeCloseTo(3.9)
  expect(after.R1!.y).toBeCloseTo(0.45)
  expect(after.R2!.y).toBeCloseTo(-0.45)
  expect(after.SJ1!.y).toBeCloseTo(0)
  expectClearance(after)
})

test("does not shorten a cyclic layout by sending a connection through a fixed component", () => {
  const input = blockerFixture.inputProblem as unknown as InputProblem
  const initial = blockerFixture.initialPlacements
  const after = run(input, initial)
  const blocker = input.chipMap.blocker!
  const center = blocker.fixedPosition!
  const left = center.x - blocker.size.x / 2
  const right = center.x + blocker.size.x / 2
  const bottom = center.y - blocker.size.y / 2
  const top = center.y + blocker.size.y / 2
  const crossesBlocker = (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => {
    // Intersect the parameter intervals for the segment's X and Y projections.
    const interval = (from: number, to: number, min: number, max: number) => {
      if (Math.abs(to - from) < 1e-9)
        return from > min && from < max ? [0, 1] : [1, 0]
      return [(min - from) / (to - from), (max - from) / (to - from)].sort(
        (a, b) => a - b,
      )
    }
    const xs = interval(a.x, b.x, left, right)
    const ys = interval(a.y, b.y, bottom, top)
    return Math.max(0, xs[0]!, ys[0]!) < Math.min(1, xs[1]!, ys[1]!)
  }
  // This shorter candidate was produced with the obstruction check disabled.
  // It satisfies component spacing but its horizontal connection cuts through
  // the blocker, so wire length alone must not make it an acceptable result.
  expect(crossesBlocker({ x: 1.2, y: -0.4 }, { x: 3.4, y: -0.4 })).toBe(true)
  const points = new Map<string, { x: number; y: number }>()
  for (const chip of Object.values(input.chipMap))
    for (const pinId of chip.pins) {
      const placement = after[chip.chipId]!
      const offset = rotatePinOffset(
        input.chipPinMap[pinId]!.offset,
        placement.ccwRotationDegrees,
      )
      points.set(pinId, {
        x: placement.x + offset.x,
        y: placement.y + offset.y,
      })
    }
  for (const [pin, others] of Object.entries(connections(input)))
    for (const other of others) {
      expect(crossesBlocker(points.get(pin)!, points.get(other.pinId)!)).toBe(
        false,
      )
    }
  expect(after.blocker).toEqual(initial.blocker)
  expect(after.node0).toEqual(initial.node0)
  expect(
    connectionLengths(input, after, input.chipGap / 2).reduce(
      (sum, length) => sum + length,
      0,
    ),
  ).toBeLessThan(6)
})
