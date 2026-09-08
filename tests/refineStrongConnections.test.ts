import { expect, test } from "bun:test"
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getPinIdToStronglyConnectedPinsObj } from "lib/solvers/LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"
import { refineStrongConnections } from "lib/solvers/PackInnerPartitionsSolver/refineStrongConnections"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import { boundsAreaOverlap, boundsDistance } from "@tscircuit/math-utils"
import { getPlacementBounds } from "lib/solvers/AlignTestPointsSolver/placementsOverlap"
import si7021 from "../pages/repros/repro-si7021/si7021-matchpack-input.json"

const problem = si7021 as InputProblem
// Current-main output of the unchanged public SI7021 reproduction.
const packed: OutputLayout = {
  chipPlacements: {
    U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
    SJ1: { x: 0.025, y: -1.15, ccwRotationDegrees: 90 },
    R2: { x: 1.025, y: -1.35, ccwRotationDegrees: 0 },
    R1: { x: 1.7, y: 0.15, ccwRotationDegrees: 0 },
    C2: { x: -2.03, y: 0, ccwRotationDegrees: 90 },
  },
  groupPlacements: {},
}

const getConnectionLengths = (layout: OutputLayout, inputProblem = problem) => {
  const positions = Object.fromEntries(
    Object.values(inputProblem.chipMap).flatMap((chip) =>
      chip.pins.map((pinId) => {
        const placement = layout.chipPlacements[chip.chipId]!
        const offset = rotatePinOffset(
          inputProblem.chipPinMap[pinId]!.offset,
          placement.ccwRotationDegrees,
        )
        return [pinId, { x: placement.x + offset.x, y: placement.y + offset.y }]
      }),
    ),
  )
  return Object.entries(
    getPinIdToStronglyConnectedPinsObj(inputProblem),
  ).flatMap(([firstPinId, neighbours]) =>
    neighbours
      .filter((pin) => firstPinId < pin.pinId)
      .map((pin) => {
        const first = positions[firstPinId]!,
          second = positions[pin.pinId]!
        return Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
      }),
  )
}
const refine = (inputProblem = problem, inputLayout = packed) =>
  refineStrongConnections({
    inputProblem,
    inputLayout,
    connectedPinsByPinId: getPinIdToStronglyConnectedPinsObj(inputProblem),
  })
const expectClearance = (layout: OutputLayout, inputProblem = problem) => {
  const chips = Object.values(inputProblem.chipMap)
  for (let a = 0; a < chips.length; a++)
    for (let b = a + 1; b < chips.length; b++) {
      const first = chips[a]!,
        second = chips[b]!
      expect(
        boundsDistance(
          getPlacementBounds({
            placement: layout.chipPlacements[first.chipId]!,
            size: first.size,
          }),
          getPlacementBounds({
            placement: layout.chipPlacements[second.chipId]!,
            size: second.size,
          }),
        ),
      ).toBeGreaterThanOrEqual(inputProblem.chipGap - 1e-6)
    }
}

test("unchanged SI7021 fixture improves in the full pipeline", async () => {
  const before = structuredClone(problem),
    solver = new LayoutPipelineSolver(problem)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  const layout = solver.getOutputLayout()
  expect(
    getConnectionLengths(layout).reduce((sum, length) => sum + length, 0),
  ).toBeLessThan(4.5)
  expect(solver.checkForOverlaps(layout)).toEqual([])
  expectClearance(layout)
  expect(problem).toEqual(before)
  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgName: "si7021-refined",
    svgWidth: 1000,
    svgHeight: 600,
  })
})
test("each real-fixture connection is no longer after refinement", () => {
  const before = structuredClone(packed),
    result = refine(),
    beforeLengths = getConnectionLengths(packed),
    afterLengths = getConnectionLengths(result)
  expect(afterLengths.reduce((sum, length) => sum + length, 0)).toBeCloseTo(
    3.6,
    6,
  )
  for (const [index, length] of afterLengths.entries())
    expect(length).toBeLessThanOrEqual(beforeLengths[index]! + 1e-6)
  expectClearance(result)
  expect(packed).toEqual(before)
})
test("fixed placements remain exact", () => {
  const fixed = structuredClone(problem)
  for (const chip of Object.values(fixed.chipMap))
    chip.fixedPosition = packed.chipPlacements[chip.chipId]!
  expect(refine(fixed)).toEqual(packed)
  delete fixed.chipMap.R1!.fixedPosition
  const result = refine(fixed)
  for (const chip of Object.values(fixed.chipMap))
    if (chip.fixedPosition)
      expect(result.chipPlacements[chip.chipId]).toEqual(
        packed.chipPlacements[chip.chipId],
      )
})
test("explicit rotation constraints remain authoritative", () => {
  const constrained = structuredClone(problem)
  constrained.chipMap.R1!.availableRotations = [0]
  constrained.chipMap.R2!.availableRotations = [0]
  constrained.chipMap.SJ1!.availableRotations = [90]
  const result = refine(constrained)
  for (const chip of Object.values(constrained.chipMap))
    expect(
      chip.availableRotations!.some(
        (ccwRotationDegrees) =>
          ccwRotationDegrees ===
          result.chipPlacements[chip.chipId]!.ccwRotationDegrees,
      ),
    ).toBe(true)
  expectClearance(result)
})
test("repeated and reordered inputs produce identical results", () => {
  const reordered = structuredClone(problem)
  reordered.chipMap = Object.fromEntries(
    Object.entries(reordered.chipMap).reverse(),
  )
  reordered.chipPinMap = Object.fromEntries(
    Object.entries(reordered.chipPinMap).reverse(),
  )
  const expected = refine()
  for (let i = 0; i < 5; i++) expect(refine()).toEqual(expected)
  expect(refine(reordered)).toEqual(expected)
})
test("no strong connections leaves the layout unchanged", () =>
  expect(refine({ ...problem, pinStrongConnMap: {} })).toEqual(packed))
test("an obstacle blocks unsafe compaction", () => {
  const obstructed = structuredClone(problem),
    layout = structuredClone(packed)
  obstructed.chipMap.obstacle = {
    chipId: "obstacle",
    pins: [],
    size: { x: 0.4, y: 0.4 },
    fixedPosition: { x: 2, y: -1.5 },
  }
  layout.chipPlacements.obstacle = { x: 2, y: -1.5, ccwRotationDegrees: 0 }
  const result = refine(obstructed, layout)
  expect(result.chipPlacements.obstacle).toEqual(layout.chipPlacements.obstacle)
  expect(result.chipPlacements.SJ1).not.toEqual(refine().chipPlacements.SJ1)
  expectClearance(result, obstructed)
})

test("zero-gap layouts still reject overlapping bodies", () => {
  const zeroGap = { ...problem, chipGap: 0 }
  const result = refine(zeroGap)
  const placements = Object.entries(result.chipPlacements)
  for (let a = 0; a < placements.length; a++)
    for (let b = a + 1; b < placements.length; b++) {
      const [firstId, first] = placements[a]!
      const [secondId, second] = placements[b]!
      expect(
        boundsAreaOverlap(
          getPlacementBounds({
            placement: first,
            size: zeroGap.chipMap[firstId]!.size,
          }),
          getPlacementBounds({
            placement: second,
            size: zeroGap.chipMap[secondId]!.size,
          }),
        ),
      ).toBe(0)
    }
})

test.each(["body", "connection"] as const)(
  "refinement rolls back a newly intersected %s",
  (obstruction) => {
    const input: InputProblem = {
      chipMap: {
        A: {
          chipId: "A",
          pins: ["A.1"],
          size: { x: 0.2, y: 0.2 },
          fixedPosition: { x: 0, y: 0 },
        },
        B: {
          chipId: "B",
          pins: ["B.1"],
          size: { x: 0.2, y: 0.2 },
          fixedPosition: { x: 4, y: 0 },
        },
        C: {
          chipId: "C",
          pins: ["C.1", "C.2"],
          size: { x: 0.4, y: 0.2 },
          availableRotations: [0],
        },
      },
      chipPinMap: {
        "A.1": { pinId: "A.1", offset: { x: 0, y: 0 }, side: "x+" },
        "B.1": { pinId: "B.1", offset: { x: 0, y: 0 }, side: "x-" },
        "C.1": { pinId: "C.1", offset: { x: -0.2, y: 0 }, side: "x-" },
        "C.2": { pinId: "C.2", offset: { x: 0.2, y: 0 }, side: "x+" },
      },
      pinStrongConnMap: { "A.1-C.1": true, "B.1-C.2": true },
      netMap: {},
      netConnMap: {},
      chipGap: 0.1,
      partitionGap: 1,
    }
    const layout: OutputLayout = {
      chipPlacements: {
        A: { x: 0, y: 0, ccwRotationDegrees: 0 },
        B: { x: 4, y: 0, ccwRotationDegrees: 0 },
        C: { x: 2, y: 3, ccwRotationDegrees: 0 },
      },
      groupPlacements: {},
    }
    expect(refine(input, layout).chipPlacements.C!.y).toBe(0)
    const obstacles = obstruction === "body" ? { O: 0 } : { D: -1, E: 1 }
    for (const [chipId, y] of Object.entries(obstacles)) {
      const pinId = `${chipId}.1`
      input.chipMap[chipId] = {
        chipId,
        pins: [pinId],
        size: { x: 0.2, y: 0.2 },
        fixedPosition: { x: 1, y },
      }
      input.chipPinMap[pinId] = { pinId, offset: { x: 0, y: 0 }, side: "x-" }
      layout.chipPlacements[chipId] = { x: 1, y, ccwRotationDegrees: 0 }
    }
    if (obstruction === "connection") input.pinStrongConnMap["D.1-E.1"] = true
    expect(refine(input, layout)).toEqual(layout)
  },
)
