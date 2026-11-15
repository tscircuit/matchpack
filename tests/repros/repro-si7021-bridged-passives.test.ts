import { boundsDistance } from "@tscircuit/math-utils"
import { expect, test } from "bun:test"
import input from "../../pages/repros/repro-si7021/si7021-matchpack-input.json"
import {
  alignBridgedPassivePairs as reflowBridgePairs,
  type PartitionMembership,
} from "../../lib/solvers/AlignBridgedPassivePairsSolver/alignBridgedPassivePairs"
import { getPlacementBounds } from "../../lib/solvers/AlignTestPointsSolver/placementsOverlap"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import type { OutputLayout } from "../../lib/types/OutputLayout"
import { createPinOwnerMap } from "../../lib/utils/createPinOwnerMap"
import { rotatePinOffset } from "../../lib/utils/rotatePinOffset"

// The base fixture is one partition; the external-obstacle case supplies two.
const alignBridgedPassivePairs = (
  problem: InputProblem,
  layout: OutputLayout,
  partitions: PartitionMembership = [{ chipMap: problem.chipMap }],
) => reflowBridgePairs(problem, layout, partitions)

// Captured from the unchanged #11 fixture on main, before the bridge reflow.
const baseLayout = (): OutputLayout => ({
  chipPlacements: {
    U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
    SJ1: { x: 0.025, y: -1.15, ccwRotationDegrees: 90 },
    R2: { x: 1.025, y: -1.35, ccwRotationDegrees: 0 },
    R1: { x: 1.7, y: 0.15, ccwRotationDegrees: 0 },
    C2: { x: -2.03, y: 0, ccwRotationDegrees: 90 },
  },
  groupPlacements: {},
})

const pinPosition = (
  problem: InputProblem,
  layout: OutputLayout,
  pin: string,
) => {
  const owner = createPinOwnerMap(problem).get(pin)!
  const placement = layout.chipPlacements[owner.chipId]!
  const offset = rotatePinOffset(
    problem.chipPinMap[pin]!.offset,
    placement.ccwRotationDegrees,
  )
  return { x: placement.x + offset.x, y: placement.y + offset.y }
}

const strongDistance = (problem: InputProblem, layout: OutputLayout) => {
  const owners = createPinOwnerMap(problem)
  const seen = new Set<string>()
  let total = 0
  for (const [key, connected] of Object.entries(problem.pinStrongConnMap)) {
    const [a, b] = key.split("-")
    if (!connected || !a || !b || !owners.has(a) || !owners.has(b)) continue
    const edge = [a, b].sort().join("|")
    if (seen.has(edge)) continue
    seen.add(edge)
    const first = pinPosition(problem, layout, a),
      second = pinPosition(problem, layout, b)
    total += Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
  }
  return total
}

const assertValid = (problem: InputProblem, layout: OutputLayout) => {
  const ids = Object.keys(layout.chipPlacements)
  for (const id of ids) {
    const chip = problem.chipMap[id]!,
      placement = layout.chipPlacements[id]!
    expect(Number.isFinite(placement.x) && Number.isFinite(placement.y)).toBe(
      true,
    )
    expect(chip.availableRotations ?? [0, 90, 180, 270]).toContain(
      placement.ccwRotationDegrees,
    )
    if (chip.fixedPosition) {
      expect(placement.x).toBeCloseTo(chip.fixedPosition.x, 8)
      expect(placement.y).toBeCloseTo(chip.fixedPosition.y, 8)
    }
  }
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!,
        b = ids[j]!
      expect(
        boundsDistance(
          getPlacementBounds({
            placement: layout.chipPlacements[a]!,
            size: problem.chipMap[a]!.size,
          }),
          getPlacementBounds({
            placement: layout.chipPlacements[b]!,
            size: problem.chipMap[b]!.size,
          }),
        ),
      ).toBeGreaterThanOrEqual(problem.chipGap - 1e-6)
    }
}

test("SI7021 keeps the two bridged pull-ups together with component clearance", async () => {
  const problem = structuredClone(input) as InputProblem
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  const layout = solver.getOutputLayout()
  expect(strongDistance(problem, layout)).toBeLessThan(4)
  assertValid(problem, layout)
  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 800,
    svgHeight: 600,
  })
})

test.each([0, 90, 180, 270])(
  "bridge reflow respects a rotated and translated fixed anchor: %i degrees",
  (angle) => {
    const problem = structuredClone(input) as InputProblem
    const layout = baseLayout()
    for (const placement of Object.values(layout.chipPlacements)) {
      const rotated = rotatePinOffset(placement, angle)
      placement.x = rotated.x + 11
      placement.y = rotated.y - 7
      placement.ccwRotationDegrees =
        (placement.ccwRotationDegrees + angle) % 360
    }
    problem.chipMap.U1!.fixedPosition = { x: 11, y: -7 }
    const untouched = structuredClone({ problem, layout })
    const output = alignBridgedPassivePairs(problem, layout)
    expect(strongDistance(problem, output)).toBeCloseTo(3.5, 6)
    expect(output.chipPlacements.U1).toEqual(layout.chipPlacements.U1)
    expect(output.chipPlacements.SJ1!.ccwRotationDegrees).toBe(
      layout.chipPlacements.SJ1!.ccwRotationDegrees,
    )
    assertValid(problem, output)
    expect({ problem, layout }).toEqual(untouched)
  },
)

test.each(["R1", "R2", "SJ1"])("preserves the fixed component %s", (id) => {
  const problem = structuredClone(input) as InputProblem
  const layout = baseLayout(),
    placement = layout.chipPlacements[id]!
  problem.chipMap[id]!.fixedPosition = { x: placement.x, y: placement.y }
  const output = alignBridgedPassivePairs(problem, layout)
  expect(output.chipPlacements[id]).toEqual(placement)
  assertValid(problem, output)
})

test("does not introduce a forbidden passive rotation", () => {
  const problem = structuredClone(input) as InputProblem
  problem.chipMap.R1!.availableRotations = [0]
  const output = alignBridgedPassivePairs(problem, baseLayout())
  expect(output.chipPlacements.R1!.ccwRotationDegrees).toBe(0)
  assertValid(problem, output)
})

test("keeps clearance when the outward row is occupied by a fixed component", () => {
  const problem = structuredClone(input) as InputProblem
  problem.chipMap.blocker = {
    chipId: "blocker",
    pins: [],
    size: { x: 0.6, y: 0.6 },
    fixedPosition: { x: 3.1, y: 0 },
    availableRotations: [0],
  }
  const layout = baseLayout()
  layout.chipPlacements.blocker = { x: 3.1, y: 0, ccwRotationDegrees: 0 }
  const output = alignBridgedPassivePairs(problem, layout)
  assertValid(problem, output)
  expect(strongDistance(problem, output)).toBeLessThanOrEqual(
    strongDistance(problem, layout) + 1e-6,
  )
})

test("finds the topology when component and pin ids have no reference-designator names", () => {
  const original = structuredClone(input) as InputProblem
  const chipIds = new Map(
    Object.keys(original.chipMap).map((id, i) => [id, "component_" + i]),
  )
  const pinIds = new Map(
    Object.keys(original.chipPinMap).map((id, i) => [id, "port_" + i]),
  )
  const renameConnections = (map: Record<string, boolean>) =>
    Object.fromEntries(
      Object.entries(map).map(([key, value]) => [
        key
          .split("-")
          .map((id) => pinIds.get(id) ?? id)
          .join("-"),
        value,
      ]),
    )
  const problem: InputProblem = {
    ...original,
    chipMap: Object.fromEntries(
      Object.entries(original.chipMap).map(([id, chip]) => [
        chipIds.get(id)!,
        {
          ...chip,
          chipId: chipIds.get(id)!,
          pins: chip.pins.map((pin) => pinIds.get(pin)!),
        },
      ]),
    ),
    chipPinMap: Object.fromEntries(
      Object.entries(original.chipPinMap).map(([id, pin]) => [
        pinIds.get(id)!,
        { ...pin, pinId: pinIds.get(id)! },
      ]),
    ),
    pinStrongConnMap: renameConnections(original.pinStrongConnMap),
    netConnMap: renameConnections(original.netConnMap),
  }
  const layout = baseLayout()
  layout.chipPlacements = Object.fromEntries(
    Object.entries(layout.chipPlacements).map(([id, placement]) => [
      chipIds.get(id)!,
      placement,
    ]),
  )
  const output = alignBridgedPassivePairs(problem, layout)
  expect(strongDistance(problem, output)).toBeLessThan(4)
  assertValid(problem, output)
})

test("does not lengthen an additional strong connection on the third bridge pin", () => {
  const problem = structuredClone(input) as InputProblem
  problem.pinStrongConnMap["SJ1.2-C2.2"] = true
  const layout = baseLayout()
  const output = alignBridgedPassivePairs(problem, layout)
  expect(strongDistance(problem, output)).toBeLessThanOrEqual(
    strongDistance(problem, layout) + 1e-6,
  )
  assertValid(problem, output)
})

test("preserves partitionGap against a component in a different packed partition", () => {
  const problem = structuredClone(input) as InputProblem
  const originalPartition = { chipMap: { ...problem.chipMap } }
  problem.chipMap.outside = {
    chipId: "outside",
    pins: [],
    size: { x: 0.6, y: 0.6 },
    fixedPosition: { x: 4.3, y: 0 },
    availableRotations: [0],
  }
  const layout = baseLayout()
  layout.chipPlacements.outside = { x: 4.3, y: 0, ccwRotationDegrees: 0 }
  const output = alignBridgedPassivePairs(problem, layout, [
    originalPartition,
    { chipMap: { outside: problem.chipMap.outside } },
  ])
  const obstacle = getPlacementBounds({
    placement: output.chipPlacements.outside!,
    size: problem.chipMap.outside.size,
  })
  for (const id of Object.keys(originalPartition.chipMap)) {
    expect(
      boundsDistance(
        obstacle,
        getPlacementBounds({
          placement: output.chipPlacements[id]!,
          size: problem.chipMap[id]!.size,
        }),
      ),
    ).toBeGreaterThanOrEqual(problem.partitionGap - 1e-6)
  }
})
