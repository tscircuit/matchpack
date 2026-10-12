import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { refineSharedTerminalBranches } from "lib/solvers/PackInnerPartitionsSolver/refineSharedTerminalBranches"
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "lib/utils/rotatePinOffset"
import fixture from "../../pages/repros/repro-si7021/si7021-matchpack-input.json"

const original = () => structuredClone(fixture) as InputProblem
const baseline = (): OutputLayout => ({
  chipPlacements: {
    U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
    C2: { x: -2.03, y: 0, ccwRotationDegrees: 90 },
    R1: { x: 1.7, y: 0.15, ccwRotationDegrees: 0 },
    R2: { x: 1.025, y: -1.35, ccwRotationDegrees: 0 },
    SJ1: { x: 0.025, y: -1.15, ccwRotationDegrees: 90 },
  },
  groupPlacements: {},
})
const solve = (problem: InputProblem) => {
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  return solver.getOutputLayout()
}

function geometry(problem: InputProblem, layout: OutputLayout) {
  const owners = new Map(
    Object.values(problem.chipMap).flatMap((c) =>
      c.pins.map((p) => [p, c.chipId] as const),
    ),
  )
  const seen = new Set<string>()
  const lines = Object.entries(problem.pinStrongConnMap).flatMap(
    ([key, connected]) => {
      const [a, b] = key.split("-")
      if (!connected || !owners.has(a!) || !owners.has(b!)) return []
      const edgeId = [a!, b!].sort().join("-")
      if (seen.has(edgeId)) return []
      seen.add(edgeId)
      return [
        [a!, b!].map((pin) => {
          const placement = layout.chipPlacements[owners.get(pin)!]!
          const offset = rotatePinOffset(
            problem.chipPinMap[pin]!.offset,
            placement.ccwRotationDegrees,
          )
          return { x: placement.x + offset.x, y: placement.y + offset.y }
        }),
      ]
    },
  )
  const cross = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
  ) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  let crossings = 0
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const [a, b] = lines[i]!
      const [c, d] = lines[j]!
      if (
        cross(a!, b!, c!) * cross(a!, b!, d!) < -1e-9 &&
        cross(c!, d!, a!) * cross(c!, d!, b!) < -1e-9
      )
        crossings++
    }
  return {
    crossings,
    length: lines.reduce(
      (sum, [a, b]) => sum + Math.abs(a!.x - b!.x) + Math.abs(a!.y - b!.y),
      0,
    ),
  }
}

function assertValid(problem: InputProblem, layout: OutputLayout) {
  expect(Object.keys(layout.chipPlacements).sort()).toEqual(
    Object.keys(problem.chipMap).sort(),
  )
  const boxes = Object.values(problem.chipMap).map((chip) => {
    const p = layout.chipPlacements[chip.chipId]!
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
    expect(chip.availableRotations ?? [0, 90, 180, 270]).toContain(
      p.ccwRotationDegrees,
    )
    if (chip.fixedPosition) {
      expect(p.x).toBeCloseTo(chip.fixedPosition.x, 8)
      expect(p.y).toBeCloseTo(chip.fixedPosition.y, 8)
    }
    const size = getRotatedSize(chip.size, p.ccwRotationDegrees)
    return {
      minX: p.x - size.x / 2,
      maxX: p.x + size.x / 2,
      minY: p.y - size.y / 2,
      maxY: p.y + size.y / 2,
    }
  })
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!
      const b = boxes[j]!
      const gap = Math.max(
        a.minX - b.maxX,
        b.minX - a.maxX,
        a.minY - b.maxY,
        b.minY - a.maxY,
      )
      expect(gap).toBeGreaterThanOrEqual(problem.chipGap - 1e-8)
    }
}

test("SI7021 shared-terminal branches are parallel, shorter and uncrossed without moving the anchor or decoupler", () => {
  const problem = original()
  const before = JSON.stringify(problem)
  const layout = solve(problem)
  expect(JSON.stringify(problem)).toBe(before)
  assertValid(problem, layout)
  const quality = geometry(problem, layout)
  // Observed untouched main at 32dad82: length 5.9, one proper crossing.
  expect(quality.length).toBeLessThan(5.9)
  expect(quality.crossings).toBe(0)
  expect(layout.chipPlacements.U1).toEqual({
    x: 0,
    y: 0,
    ccwRotationDegrees: 0,
  })
  expect(layout.chipPlacements.C2!.x).toBeCloseTo(-2.03, 8)
  expect(layout.chipPlacements.C2!.y).toBeCloseTo(0, 8)
  expect(layout.chipPlacements.C2!.ccwRotationDegrees).toBe(90)
  expect(layout.chipPlacements.R1!.x).toBeCloseTo(
    layout.chipPlacements.R2!.x,
    8,
  )
  expect(layout.chipPlacements.R1!.ccwRotationDegrees).toBe(
    layout.chipPlacements.R2!.ccwRotationDegrees,
  )
})

test("SI7021 remains deterministic with reciprocal strong edges", () => {
  const problem = original()
  for (const [key, value] of Object.entries(problem.pinStrongConnMap)) {
    const [a, b] = key.split("-")
    problem.pinStrongConnMap[`${b}-${a}`] = value
  }
  const first = solve(structuredClone(problem))
  const second = solve(structuredClone(problem))
  expect(first).toEqual(second)
  expect(geometry(problem, first).crossings).toBe(0)
  assertValid(problem, first)
})

test("shared-terminal layout is topology-based, not dependent on SI7021 reference names", () => {
  const renamed = JSON.parse(
    JSON.stringify(fixture)
      .replaceAll("U1", "Alpha")
      .replaceAll("R1", "Beta")
      .replaceAll("R2", "Gamma")
      .replaceAll("SJ1", "Delta")
      .replaceAll("C2", "Epsilon"),
  ) as InputProblem
  const layout = solve(renamed)
  assertValid(renamed, layout)
  expect(geometry(renamed, layout).crossings).toBe(0)
  expect(geometry(renamed, layout).length).toBeLessThan(5.9)
  expect(layout.chipPlacements.Beta!.x).toBeCloseTo(
    layout.chipPlacements.Gamma!.x,
    8,
  )
})

for (const rotation of [0, 90, 180, 270] as const) {
  test(`shared-terminal layout preserves an anchor fixed at a ${rotation}-degree rotation`, () => {
    const problem = original()
    problem.chipMap.U1!.fixedPosition = { x: 5, y: 2 }
    problem.chipMap.U1!.availableRotations = [rotation]
    const layout = solve(problem)
    assertValid(problem, layout)
    expect(layout.chipPlacements.U1!.ccwRotationDegrees).toBe(rotation)
    expect(geometry(problem, layout).crossings).toBe(0)
  })
}

test("shared-terminal refinement must not move a fixed branch", () => {
  const problem = original()
  problem.chipMap.R1!.fixedPosition = { x: 1.7, y: 0.15 }
  problem.chipMap.R1!.availableRotations = [0]
  const layout = solve(problem)
  assertValid(problem, layout)
})

test("shared-terminal refinement never uses a disallowed branch rotation", () => {
  const problem = original()
  problem.chipMap.R1!.availableRotations = [0]
  const layout = solve(problem)
  assertValid(problem, layout)
  expect(layout.chipPlacements.R1!.ccwRotationDegrees).toBe(0)
})

test("shared-terminal refinement does not mutate the supplied layout or problem", () => {
  const inputProblem = original()
  const inputLayout = baseline()
  const before = JSON.stringify({ inputProblem, inputLayout })
  const result = refineSharedTerminalBranches({ inputProblem, inputLayout })
  expect(JSON.stringify({ inputProblem, inputLayout })).toBe(before)
  expect(result.chipPlacements.R1).not.toEqual(inputLayout.chipPlacements.R1)
  expect(result.groupPlacements).toEqual(inputLayout.groupPlacements)
})

test("extra external strong branch connections retain the packed layout", () => {
  const inputProblem = original()
  const inputLayout = baseline()
  inputProblem.pinStrongConnMap["R1.2-C2.1"] = true
  expect(refineSharedTerminalBranches({ inputProblem, inputLayout })).toEqual(
    inputLayout,
  )
})

test("an unconnected component obstructing the new branch placement prevents reflow", () => {
  const inputProblem = original()
  const inputLayout = baseline()
  inputProblem.chipMap.Blocker = {
    chipId: "Blocker",
    pins: [],
    size: { x: 0.1, y: 0.1 },
    fixedPosition: { x: 2, y: 0.45 },
  }
  inputLayout.chipPlacements.Blocker = { x: 2, y: 0.45, ccwRotationDegrees: 0 }
  expect(refineSharedTerminalBranches({ inputProblem, inputLayout })).toEqual(
    inputLayout,
  )
})

test("reflow cannot place its components across an unrelated strong connection", () => {
  const inputProblem = original()
  const inputLayout = baseline()
  for (const [id, y, side] of [
    ["Q1", -3, "y+"],
    ["Q2", 3, "y-"],
  ] as const) {
    inputProblem.chipMap[id] = {
      chipId: id,
      pins: [`${id}.1`],
      size: { x: 0.1, y: 0.1 },
    }
    inputProblem.chipPinMap[`${id}.1`] = {
      pinId: `${id}.1`,
      offset: { x: 0, y: 0 },
      side,
    }
    inputLayout.chipPlacements[id] = { x: 2, y, ccwRotationDegrees: 0 }
  }
  inputProblem.pinStrongConnMap["Q1.1-Q2.1"] = true
  expect(refineSharedTerminalBranches({ inputProblem, inputLayout })).toEqual(
    inputLayout,
  )
})

test("false extra edges do not suppress a valid shared-terminal topology", () => {
  const inputProblem = original()
  const inputLayout = baseline()
  inputProblem.pinStrongConnMap["R1.2-C2.1"] = false
  const result = refineSharedTerminalBranches({ inputProblem, inputLayout })
  expect(geometry(inputProblem, result).length).toBeLessThan(5.9)
  expect(geometry(inputProblem, result).crossings).toBe(0)
})

test("declared pin side, not the largest pin offset, controls reflow on a tall anchor", () => {
  const inputProblem = original()
  const inputLayout = baseline()
  inputProblem.chipMap.U1!.size.y = 8
  inputProblem.chipPinMap["U1.3"]!.offset.y = 2.8
  inputProblem.chipPinMap["U1.4"]!.offset.y = 3.2
  const result = refineSharedTerminalBranches({ inputProblem, inputLayout })
  expect(result.chipPlacements.U1).toEqual(inputLayout.chipPlacements.U1)
  expect(result.chipPlacements.R1!.x).toBeCloseTo(
    result.chipPlacements.R2!.x,
    8,
  )
  expect(result.chipPlacements.R1!.x).toBeGreaterThan(1.5)
  expect(result.chipPlacements.R1!.ccwRotationDegrees).toBe(90)
  expect(result.chipPlacements.R2!.ccwRotationDegrees).toBe(90)
  expect(result.chipPlacements.R1!.y).toBeGreaterThan(2.5)
  expect(geometry(inputProblem, result).length).toBeLessThan(
    geometry(inputProblem, inputLayout).length,
  )
  assertValid(inputProblem, result)
})

test("a zero configured gap still cannot produce overlapping components", () => {
  const inputProblem = original()
  const inputLayout = baseline()
  inputProblem.chipGap = 0
  const result = refineSharedTerminalBranches({ inputProblem, inputLayout })
  assertValid(inputProblem, result)
  expect(geometry(inputProblem, result).crossings).toBe(0)
})
