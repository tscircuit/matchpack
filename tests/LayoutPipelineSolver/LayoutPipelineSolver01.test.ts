import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { normalizeSide } from "lib/types/Side"

test("LayoutPipelineSolver01 visualization example", () => {
  const problem: InputProblem = {
    chipMap: {
      C1: { chipId: "C1", pins: ["P1", "P2"], size: { x: 2.0, y: 1.0 } },
    },
    chipPinMap: {
      P1: { pinId: "P1", offset: { x: 0, y: 0 }, side: normalizeSide("left") },
      P2: {
        pinId: "P2",
        offset: { x: 10, y: 10 },
        side: normalizeSide("right"),
      },
    },
    netMap: {
      N1: { netId: "N1" },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "P1-N1": true,
      "P3-N1": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
  }

  const solver = new LayoutPipelineSolver(problem)

  // Test initial visualization (before solving)
  const initialViz = solver.visualize()
  expect(initialViz.rects?.length).toBe(1) // 1 chip
  expect(initialViz.points?.length).toBe(2) // 2 chip pins
  expect(initialViz.lines?.length).toBe(1) // 1 net
  expect(initialViz.texts?.length).toBe(1) // 1 for chip

  // Now run the full pipeline
  solver.solve()

  // Verify pipeline completed successfully
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  // Test getOutputLayout
  const outputLayout = solver.getOutputLayout()
  expect(outputLayout).toBeDefined()
  expect(outputLayout.chipPlacements).toBeDefined()
  expect(outputLayout.groupPlacements).toBeDefined()

  // Should have placement for our chip
  expect(outputLayout.chipPlacements["C1"]).toBeDefined()
  const placement = outputLayout.chipPlacements["C1"]!
  expect(typeof placement.x).toBe("number")
  expect(typeof placement.y).toBe("number")
  expect(typeof placement.ccwRotationDegrees).toBe("number")

  // Check for overlaps - should have none
  const overlaps = solver.checkForOverlaps(outputLayout)
  expect(overlaps.length).toBe(0)

  // Final visualization should work
  const finalViz = solver.visualize()
  expect(finalViz).toBeDefined()
  expect(finalViz.rects).toBeDefined()
})
