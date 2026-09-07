import { expect, test } from "bun:test"
import { boundsDistance } from "@tscircuit/math-utils"
import { getPlacementBounds } from "../../lib/solvers/AlignTestPointsSolver/placementsOverlap"
import type { GroundedLoadPair } from "../../lib/solvers/GroundedLoadPairSolver/getGroundedLoadPairs"
import { resolveGroundedLoadPairOverlaps } from "../../lib/solvers/GroundedLoadPairSolver/resolveGroundedLoadPairOverlaps"
import type { InputProblem } from "../../lib/types/InputProblem"
import type { Placement } from "../../lib/types/OutputLayout"

type Obstacle = Placement & { size?: { x: number; y: number } }

const createFixture = (obstacles: readonly Obstacle[]) => {
  const inputProblem: InputProblem = {
    chipMap: {},
    chipPinMap: {},
    netMap: {},
    netConnMap: {},
    pinStrongConnMap: {},
    chipGap: 0.5,
    partitionGap: 1,
  }
  const chipPlacements: Record<string, Placement> = {
    R1: { x: 0, y: 1.25, ccwRotationDegrees: 270 },
    C1: { x: 0, y: -1.25, ccwRotationDegrees: 270 },
  }
  for (const chipId of ["R1", "C1"]) {
    inputProblem.chipMap[chipId] = {
      chipId,
      pins: [`${chipId}.1`, `${chipId}.2`],
      size: { x: 2, y: 1 },
    }
  }
  for (const [index, { size, ...placement }] of obstacles.entries()) {
    const chipId = `BLOCKER${index}`
    inputProblem.chipMap[chipId] = {
      chipId,
      pins: [],
      size: size ?? { x: 1, y: 1 },
      fixedPosition: { x: placement.x, y: placement.y },
    }
    chipPlacements[chipId] = placement
  }
  const pair: GroundedLoadPair = {
    upperChip: inputProblem.chipMap.R1!,
    lowerChip: inputProblem.chipMap.C1!,
    upperOuterPinId: "R1.1",
    upperInnerPinId: "R1.2",
    lowerInnerPinId: "C1.1",
    groundPinId: "C1.2",
    groundNetId: "GND",
  }
  return { inputProblem, chipPlacements, groundedLoadPairs: [pair] }
}

const upperObstacle: Obstacle = { x: 0, y: 1, ccwRotationDegrees: 0 }
const lowerObstacle: Obstacle = { x: 0, y: -4, ccwRotationDegrees: 0 }

test.each([
  { name: "inside the upper body", obstacles: [upperObstacle] },
  {
    name: "inside the lower body",
    obstacles: [{ x: 0, y: -1.5, ccwRotationDegrees: 0 }],
  },
  {
    name: "below the first collision",
    obstacles: [upperObstacle, lowerObstacle],
  },
  {
    name: "below the first collision in reverse map order",
    obstacles: [lowerObstacle, upperObstacle],
  },
  {
    name: "with a rotated body",
    obstacles: [{ x: 0, y: 1, ccwRotationDegrees: 90, size: { x: 3, y: 1 } }],
  },
])("clears an obstacle $name while keeping the pair rigid", ({ obstacles }) => {
  const params = createFixture(obstacles)
  const before = structuredClone(params.chipPlacements)
  resolveGroundedLoadPairOverlaps(params)

  const { chipPlacements, inputProblem } = params
  const upperShift = before.R1!.y - chipPlacements.R1!.y
  expect(upperShift).toBeGreaterThan(0)
  expect(before.C1!.y - chipPlacements.C1!.y).toBeCloseTo(upperShift)

  for (const chipId of ["R1", "C1"]) {
    const placement = chipPlacements[chipId]!
    expect(placement.x).toBe(before[chipId]!.x)
    expect(placement.ccwRotationDegrees).toBe(
      before[chipId]!.ccwRotationDegrees,
    )
    const bounds = getPlacementBounds({
      placement,
      size: inputProblem.chipMap[chipId]!.size,
    })
    for (let index = 0; index < obstacles.length; index++) {
      const blockerId = `BLOCKER${index}`
      expect(chipPlacements[blockerId]).toEqual(before[blockerId])
      const blockerBounds = getPlacementBounds({
        placement: chipPlacements[blockerId]!,
        size: inputProblem.chipMap[blockerId]!.size,
      })
      expect(boundsDistance(bounds, blockerBounds)).toBeGreaterThanOrEqual(
        inputProblem.chipGap - 1e-6,
      )
    }
  }
})

test("preserves a clear pair with obstacles beside and below it", () => {
  const params = createFixture([
    { x: 1.5, y: 0, ccwRotationDegrees: 0 },
    lowerObstacle,
  ])
  const before = structuredClone(params.chipPlacements)
  resolveGroundedLoadPairOverlaps(params)
  expect(params.chipPlacements).toEqual(before)
})
