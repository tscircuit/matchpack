import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { OverlapResolutionSolver } from "lib/solvers/OverlapResolutionSolver/OverlapResolutionSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import { getExampleCircuitJson } from "../assets/ExampleCircuit04"

const getChipBounds = (
  layout: OutputLayout,
  inputProblem: InputProblem,
  chipId: string,
) => {
  const placement = layout.chipPlacements[chipId]!
  const chip = inputProblem.chipMap[chipId]!
  return {
    minX: placement.x - chip.size.x / 2,
    maxX: placement.x + chip.size.x / 2,
    minY: placement.y - chip.size.y / 2,
    maxY: placement.y + chip.size.y / 2,
  }
}

const hasOverlap = (
  layout: OutputLayout,
  inputProblem: InputProblem,
  chipA: string,
  chipB: string,
) => {
  const a = getChipBounds(layout, inputProblem, chipA)
  const b = getChipBounds(layout, inputProblem, chipB)
  return !(
    a.maxX <= b.minX ||
    a.minX >= b.maxX ||
    a.maxY <= b.minY ||
    a.minY >= b.maxY
  )
}

test("OverlapResolutionSolver separates overlapping chips", () => {
  const inputProblem: InputProblem = {
    chipMap: {
      U1: { chipId: "U1", pins: [], size: { x: 2, y: 2 } },
      U2: { chipId: "U2", pins: [], size: { x: 2, y: 2 } },
    },
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 0.5,
  }

  const initialLayout: OutputLayout = {
    chipPlacements: {
      U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
      U2: { x: 0.5, y: 0, ccwRotationDegrees: 0 },
    },
    groupPlacements: {},
  }

  expect(hasOverlap(initialLayout, inputProblem, "U1", "U2")).toBe(true)

  const solver = new OverlapResolutionSolver({
    inputProblem,
    initialLayout,
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.resolvedLayout).toBeDefined()
  expect(hasOverlap(solver.resolvedLayout!, inputProblem, "U1", "U2")).toBe(
    false,
  )
})

test("LayoutPipelineSolver includes overlap resolution as final phase", () => {
  const circuitJson = getExampleCircuitJson()
  const inputProblem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  const solver = new LayoutPipelineSolver(inputProblem)
  const phaseNames = solver.pipelineDef.map((step) => step.solverName)

  expect(phaseNames.at(-1)).toBe("overlapResolutionSolver")

  solver.solve()
  expect(solver.overlapResolutionSolver?.solved).toBe(true)
})
