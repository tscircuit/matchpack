import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import type { Point } from "@tscircuit/math-utils"
import input from "../pages/repros/repro-si7021/si7021-matchpack-input.json"

function rotatePoint(point: Point, angleDegrees: number): Point {
  const angleRad = (angleDegrees * Math.PI) / 180
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }
}

function getAbsolutePosition(
  pinId: string,
  problem: InputProblem,
  layout: OutputLayout,
): Point | null {
  const chipPin = problem.chipPinMap[pinId]
  if (!chipPin) return null

  let foundChipId: string | null = null
  for (const [chipId, chip] of Object.entries(problem.chipMap)) {
    if (chip.pins.includes(pinId)) {
      foundChipId = chipId
      break
    }
  }

  if (!foundChipId) return null
  const placement = layout.chipPlacements[foundChipId]
  if (!placement) return null

  const rotatedOffset = rotatePoint(
    chipPin.offset,
    placement.ccwRotationDegrees,
  )
  return {
    x: placement.x + rotatedOffset.x,
    y: placement.y + rotatedOffset.y,
  }
}

test("Reproduction of SI7021 bad layout from issue #11", () => {
  const problem = input as unknown as InputProblem

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  // Verify pipeline completed
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const outputLayout = solver.getOutputLayout()

  // Calculate alignment metrics
  const strongConnections = Object.entries(problem.pinStrongConnMap)
    .filter(([_, connected]) => connected)
    .map(([connKey]) => connKey.split("-") as [string, string])

  let totalDeviation = 0
  for (const [pinA, pinB] of strongConnections) {
    const posA = getAbsolutePosition(pinA, problem, outputLayout)
    const posB = getAbsolutePosition(pinB, problem, outputLayout)
    if (!posA || !posB) continue

    const dx = Math.abs(posA.x - posB.x)
    const dy = Math.abs(posA.y - posB.y)
    totalDeviation += Math.min(dx, dy)
  }

  // Check for overlaps
  const overlaps = solver.checkForOverlaps(outputLayout)

  // Verify metrics improved
  expect(totalDeviation).toBeLessThan(0.1)
  expect(overlaps.length).toBe(0)
})
