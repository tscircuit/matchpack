import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { findSeriesFedLoadChains } from "../../lib/solvers/PlaceSeriesFedLoadChainsSolver/findSeriesFedLoadChains"
import { placeSeriesFedLoadChains } from "../../lib/solvers/PlaceSeriesFedLoadChainsSolver/placeSeriesFedLoadChains"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../assets/rgb-leds-section.input.json"

test("RGB LEDs section schematic layout", async () => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  expect(findSeriesFedLoadChains(input as InputProblem)).toEqual([
    {
      sourceChipId: "Q1",
      sourcePinId: "Q1.3",
      seriesChipId: "R_DATA",
      seriesSourcePinId: "R_DATA.1",
      seriesLoadPinId: "R_DATA.2",
      loadChipIds: ["LED1", "LED2", "LED3", "LED4", "LED5"],
      loadEntryPinId: "LED1.1",
      sourceRailChipIds: ["R_LV", "R_HV"],
    },
  ])

  const outputLayout = solver.getOutputLayout()
  const placements = outputLayout.chipPlacements
  expect(placements.Q1!.x).toBeLessThan(placements.R_DATA!.x)
  expect(placements.R_DATA!.x).toBeLessThan(placements.LED1!.x)
  expect(placements.LED1!.x).toBeLessThan(placements.LED2!.x)
  expect(solver.checkForOverlaps(outputLayout)).toEqual([])

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})

test("series-fed load placement rolls back when the source side is blocked", () => {
  const inputProblem = input as InputProblem
  const pipelineSolver = new LayoutPipelineSolver(inputProblem)
  pipelineSolver.solveUntilPhase("placeSeriesFedLoadChainsSolver")
  const inputLayout = pipelineSolver.groundedLoadPairSolver!.outputLayout!
  const chains = findSeriesFedLoadChains(inputProblem)
  const placedLayout = placeSeriesFedLoadChains({
    inputProblem,
    inputLayout,
    chains,
  })

  const blockedInputProblem = structuredClone(inputProblem)
  const blockedInputLayout = structuredClone(inputLayout)
  const blockerPosition = placedLayout.chipPlacements.Q1!
  blockedInputProblem.chipMap.BLOCKER = {
    chipId: "BLOCKER",
    pins: [],
    size: { ...inputProblem.chipMap.Q1!.size },
    fixedPosition: blockerPosition,
  }
  blockedInputLayout.chipPlacements.BLOCKER = {
    ...blockerPosition,
    ccwRotationDegrees: 0,
  }

  const blockedLayout = placeSeriesFedLoadChains({
    inputProblem: blockedInputProblem,
    inputLayout: blockedInputLayout,
    chains,
  })
  expect(blockedLayout.chipPlacements.Q1).toEqual(inputLayout.chipPlacements.Q1)
})
