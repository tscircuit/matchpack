/**
 * Tests for the SideAwarePassiveGroupingSolver (fixes #12).
 *
 * Verifies that passives (resistors, capacitors) strongly connected to the same
 * side/edge of a large IC are arranged in a clean aligned row/column next to
 * that IC edge, rather than being scattered by PackSolver2.
 */

import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblemBottom from "../assets/repro-bq24074-bottom-resistors.input.json"
import inputProblemRight from "../assets/repro-bq24074-right-resistors.input.json"

test("passives on same bottom (y-) IC side are Y-aligned in a horizontal row", () => {
  const solver = new LayoutPipelineSolver(inputProblemBottom as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const layout = solver.getOutputLayout()

  // R1, R2, R3 all connect to U1's y- (bottom) side pins
  const r1 = layout.chipPlacements["R1"]!
  const r2 = layout.chipPlacements["R2"]!
  const r3 = layout.chipPlacements["R3"]!
  const u1 = layout.chipPlacements["U1"]!

  expect(r1).toBeDefined()
  expect(r2).toBeDefined()
  expect(r3).toBeDefined()
  expect(u1).toBeDefined()

  // All three resistors must share the same Y coordinate (horizontal row alignment)
  expect(Math.abs(r1.y - r2.y)).toBeLessThan(0.01)
  expect(Math.abs(r2.y - r3.y)).toBeLessThan(0.01)

  // The row must be below U1 (y- side = lower Y in schematic coords)
  const u1Bottom = u1.y - 5.1 / 2 // U1 height is 5.1
  expect(r1.y).toBeLessThan(u1Bottom)
})

test("passives on same right (x+) IC side are X-aligned in a vertical column", () => {
  const solver = new LayoutPipelineSolver(inputProblemRight as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const layout = solver.getOutputLayout()

  // R1, R2, R3 all connect to U1's x+ (right) side pins
  const r1 = layout.chipPlacements["R1"]!
  const r2 = layout.chipPlacements["R2"]!
  const r3 = layout.chipPlacements["R3"]!
  const u1 = layout.chipPlacements["U1"]!

  expect(r1).toBeDefined()
  expect(r2).toBeDefined()
  expect(r3).toBeDefined()
  expect(u1).toBeDefined()

  // All three resistors must share the same X coordinate (vertical column alignment)
  expect(Math.abs(r1.x - r2.x)).toBeLessThan(0.01)
  expect(Math.abs(r2.x - r3.x)).toBeLessThan(0.01)

  // The column must be to the right of U1 (x+ side = higher X in schematic coords)
  const u1Right = u1.x + 3.1 / 2 // U1 width is 3.1
  expect(r1.x).toBeGreaterThan(u1Right)
})

test("side-aware passive grouping snapshot - bottom resistors", async () => {
  const solver = new LayoutPipelineSolver(inputProblemBottom as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgName: "bottom-resistors",
    svgWidth: 600,
    svgHeight: 600,
  })
})

test("side-aware passive grouping snapshot - right resistors", async () => {
  const solver = new LayoutPipelineSolver(inputProblemRight as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgName: "right-resistors",
    svgWidth: 600,
    svgHeight: 600,
  })
})
