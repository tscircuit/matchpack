import { expect, test } from "bun:test"
import {
  type InputProblem as RoutingProblem,
  SchematicTracePipelineSolver,
} from "@tscircuit/schematic-trace-solver"
import { LayoutPipelineSolver } from "../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../lib/types/InputProblem"
import type { Placement } from "../lib/types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "../lib/utils/rotatePinOffset"
import fixture from "../pages/repros/repro-si7021/si7021-matchpack-input.json"

const problem = fixture as unknown as InputProblem
type Direction = NonNullable<
  RoutingProblem["chips"][number]["pins"][number]["_facingDirection"]
>
const normals: Record<Direction, { x: number; y: number }> = {
  "x-": { x: -1, y: 0 },
  "x+": { x: 1, y: 0 },
  "y-": { x: 0, y: -1 },
  "y+": { x: 0, y: 1 },
}

// Convert the layout's local pins into the downstream router's world coordinates.
// This exercises the trace pipeline, not @tscircuit/core's full circuit renderer.
function routingInput(placements: Record<string, Placement>): RoutingProblem {
  const pins = Object.keys(problem.chipPinMap)
  const nets = Object.keys(problem.netMap)
  return {
    chips: Object.values(problem.chipMap).map((chip) => {
      const placement = placements[chip.chipId]!
      const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
      return {
        chipId: chip.chipId,
        center: { x: placement.x, y: placement.y },
        width: size.x,
        height: size.y,
        pins: chip.pins.map((pinId) => {
          const pin = problem.chipPinMap[pinId]!
          const offset = rotatePinOffset(
            pin.offset,
            placement.ccwRotationDegrees,
          )
          const normal = rotatePinOffset(
            normals[pin.side],
            placement.ccwRotationDegrees,
          )
          const direction = (Object.keys(normals) as Direction[]).find(
            (side) =>
              normals[side].x === normal.x && normals[side].y === normal.y,
          )!
          return {
            pinId,
            x: placement.x + offset.x,
            y: placement.y + offset.y,
            _facingDirection: direction,
          }
        }),
      }
    }),
    directConnections: pins.flatMap((first, index) =>
      pins
        .slice(index + 1)
        .filter(
          (second) =>
            problem.pinStrongConnMap[`${first}-${second}`] ||
            problem.pinStrongConnMap[`${second}-${first}`],
        )
        .map((second) => ({ pinIds: [first, second] as [string, string] })),
    ),
    netConnections: nets.map((netId) => ({
      netId,
      pinIds: pins.filter((pin) => problem.netConnMap[`${pin}-${netId}`]),
    })),
    availableNetLabelOrientations: Object.fromEntries(
      nets.map((net) => [net, ["x+", "x-", "y+", "y-"]]),
    ),
    // Match @tscircuit/core 0.0.1331's default, not the standalone router's 1.
    maxMspPairDistance: 2.4,
  }
}

function routeAndCheck(placements: Record<string, Placement>) {
  const input = routingInput(placements)
  const router = new SchematicTracePipelineSolver(input)
  router.solve()
  expect(router.solved).toBe(true)
  expect(router.failed).toBe(false)
  const { traces } = router.netLabelTraceCollisionSolver!.getOutput()
  const { netLabelPlacements } =
    router.netLabelNetLabelCollisionSolver!.getOutput()
  const worldPins = new Map(
    router.inputProblem.chips.flatMap((chip) =>
      chip.pins.map((pin) => [pin.pinId, pin] as const),
    ),
  )

  // Check physical endpoints as well as the router's connectivity metadata.
  let strongTraceLength = 0
  expect(input.directConnections).toHaveLength(5)
  for (const { pinIds } of input.directConnections) {
    const trace = traces.find((candidate) =>
      pinIds.every((id) => candidate.pinIds.includes(id)),
    )
    expect(trace, pinIds.join(" -> ")).toBeDefined()
    const endpoints = [trace!.tracePath[0]!, trace!.tracePath.at(-1)!]
    for (const pinId of pinIds) {
      const pin = worldPins.get(pinId)!
      expect(
        endpoints.some(
          (end) => Math.hypot(end.x - pin.x, end.y - pin.y) < 1e-8,
        ),
        pinId,
      ).toBe(true)
    }
    for (let i = 1; i < trace!.tracePath.length; i++) {
      const a = trace!.tracePath[i - 1]!
      const b = trace!.tracePath[i]!
      strongTraceLength += Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
    }
  }

  // Measure all final traces against the router's corrected body envelopes.
  // Boundary contact is allowed; crossing any body's interior is not.
  const epsilon = 1e-8
  for (const trace of traces) {
    for (let i = 1; i < trace.tracePath.length; i++) {
      const a = trace.tracePath[i - 1]!
      const b = trace.tracePath[i]!
      const horizontal = Math.abs(a.y - b.y) < epsilon
      expect(horizontal || Math.abs(a.x - b.x) < epsilon).toBe(true)
      for (const chip of router.inputProblem.chips) {
        const left = chip.center.x - chip.width / 2 + epsilon
        const right = chip.center.x + chip.width / 2 - epsilon
        const bottom = chip.center.y - chip.height / 2 + epsilon
        const top = chip.center.y + chip.height / 2 - epsilon
        const intersects = horizontal
          ? a.y > bottom &&
            a.y < top &&
            Math.max(a.x, b.x) > left &&
            Math.min(a.x, b.x) < right
          : a.x > left &&
            a.x < right &&
            Math.max(a.y, b.y) > bottom &&
            Math.min(a.y, b.y) < top
        expect(intersects, `${trace.mspPairId} crosses ${chip.chipId}`).toBe(
          false,
        )
      }
    }
  }
  return { input, router, netLabelPlacements, strongTraceLength }
}

test("SI7021 refinement preserves routed connections and shortens their actual paths", () => {
  // Rounded output of the original packer for issue #11.
  const before = routeAndCheck({
    U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
    SJ1: { x: 0.025, y: -1.15, ccwRotationDegrees: 90 },
    R2: { x: 1.025, y: -1.35, ccwRotationDegrees: 0 },
    R1: { x: 1.7, y: 0.15, ccwRotationDegrees: 0 },
    C2: { x: -2.03, y: 0, ccwRotationDegrees: 90 },
  })
  const layout = new LayoutPipelineSolver(problem)
  layout.solve()
  expect(layout.solved).toBe(true)
  expect(layout.failed).toBe(false)
  const after = routeAndCheck(layout.getOutputLayout().chipPlacements)
  expect(before.strongTraceLength).toBeCloseTo(6.7, 6)
  expect(after.strongTraceLength).toBeCloseTo(3.9, 6)
  expect(after.strongTraceLength).toBeLessThan(before.strongTraceLength)

  // Ground has no physical route in either layout and uses matching net labels.
  // Do not equate "solver.solved" with every attempted pair being routed.
  for (const result of [before, after]) {
    const failed =
      result.router.schematicTraceLinesSolver!.failedConnectionPairs
    expect(failed).toHaveLength(1)
    expect(failed[0]!.userNetId).toBe("GND")
    for (const pinId of ["U1.1", "C2.1"]) {
      expect(
        result.netLabelPlacements.some(
          (label) => label.netId === "GND" && label.pinIds.includes(pinId),
        ),
      ).toBe(true)
    }
  }
  // Every named-net pin in the refined layout still has the correct net label.
  for (const net of after.input.netConnections) {
    for (const pinId of net.pinIds) {
      expect(
        after.netLabelPlacements.some(
          (label) => label.netId === net.netId && label.pinIds.includes(pinId),
        ),
        `${pinId} belongs to ${net.netId}`,
      ).toBe(true)
    }
  }
})
