import { expect, test } from "bun:test"
import { AlignTwoPinResistorsSolver } from "lib/solvers/AlignTwoPinResistorsSolver/AlignTwoPinResistorsSolver"
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import inputProblemJson from "../assets/repro-rectifier-series-resistor-alignment.input.json"

const packedLayout: OutputLayout = {
  chipPlacements: {
    D_RECT1: { x: 0, y: 0, ccwRotationDegrees: 0 },
    D_RECT2: { x: -2.25, y: 0, ccwRotationDegrees: 0 },
    C_FILTER: { x: -1.125, y: -1.96, ccwRotationDegrees: 0 },
    R_LIMIT: { x: 2.03, y: -0.98, ccwRotationDegrees: 0 },
    LED1: { x: 0.95, y: -3.11, ccwRotationDegrees: 0 },
  },
  groupPlacements: {},
}

test("aligns a nearby resistor with the connected pin facing it", () => {
  const solver = new AlignTwoPinResistorsSolver({
    inputProblem: structuredClone(inputProblemJson) as InputProblem,
    inputLayout: structuredClone(packedLayout),
  })
  solver.solve()

  expect(solver.outputLayout!.chipPlacements.R_LIMIT).toEqual({
    x: 2.03,
    y: 0,
    ccwRotationDegrees: 0,
  })
})

test("aligns vertical facing pins on their shared x coordinate", () => {
  const inputProblem = structuredClone(inputProblemJson) as InputProblem
  inputProblem.chipMap = {
    D_RECT1: inputProblem.chipMap.D_RECT1!,
    R_LIMIT: inputProblem.chipMap.R_LIMIT!,
  }
  inputProblem.chipPinMap = {
    "D_RECT1.1": inputProblem.chipPinMap["D_RECT1.1"]!,
    "D_RECT1.2": inputProblem.chipPinMap["D_RECT1.2"]!,
    "R_LIMIT.1": inputProblem.chipPinMap["R_LIMIT.1"]!,
    "R_LIMIT.2": inputProblem.chipPinMap["R_LIMIT.2"]!,
  }
  inputProblem.netMap = { RECT_POS: { netId: "RECT_POS" } }
  inputProblem.netConnMap = {
    "D_RECT1.2-RECT_POS": true,
    "R_LIMIT.1-RECT_POS": true,
  }
  const inputLayout: OutputLayout = {
    chipPlacements: {
      D_RECT1: { x: 0, y: 0, ccwRotationDegrees: 90 },
      R_LIMIT: { x: -0.98, y: 2.03, ccwRotationDegrees: 90 },
    },
    groupPlacements: {},
  }

  const solver = new AlignTwoPinResistorsSolver({
    inputProblem,
    inputLayout,
  })
  solver.solve()

  expect(solver.outputLayout!.chipPlacements.R_LIMIT).toEqual({
    x: 0,
    y: 2.03,
    ccwRotationDegrees: 90,
  })
})

test("keeps the packed position when alignment would violate clearance", () => {
  const inputProblem = structuredClone(inputProblemJson) as InputProblem
  inputProblem.chipMap.BLOCKER = {
    chipId: "BLOCKER",
    pins: [],
    size: { x: 0.6, y: 0.6 },
  }
  const inputLayout = structuredClone(packedLayout)
  inputLayout.chipPlacements.BLOCKER = {
    x: 2.03,
    y: 0.64,
    ccwRotationDegrees: 0,
  }

  const solver = new AlignTwoPinResistorsSolver({
    inputProblem,
    inputLayout,
  })
  solver.solve()

  expect(solver.outputLayout!.chipPlacements.R_LIMIT).toEqual(
    packedLayout.chipPlacements.R_LIMIT!,
  )
})

test("does not move an explicitly positioned resistor", () => {
  const inputProblem = structuredClone(inputProblemJson) as InputProblem
  inputProblem.chipMap.R_LIMIT!.fixedPosition = { x: 2.03, y: -0.98 }

  const solver = new AlignTwoPinResistorsSolver({
    inputProblem,
    inputLayout: structuredClone(packedLayout),
  })
  solver.solve()

  expect(solver.outputLayout!.chipPlacements.R_LIMIT).toEqual(
    packedLayout.chipPlacements.R_LIMIT!,
  )
})
