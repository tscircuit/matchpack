import { expect, test } from "bun:test"
import type {
  ChipId,
  InputProblem,
  NetId,
  PinId,
} from "../lib/types/InputProblem"
import type { Placement } from "../lib/types/OutputLayout"
import { alignResistorsWithFacingTwoPinComponents } from "../lib/utils/alignResistorsWithFacingTwoPinComponents"

const createCase = () => {
  const inputProblem: InputProblem = {
    chipMap: {
      ANCHOR_A: {
        chipId: "ANCHOR_A",
        pins: ["ANCHOR_A.1", "ANCHOR_A.2"],
        size: { x: 0.6, y: 0.6 },
      },
      R: {
        chipId: "R",
        pins: ["R.1", "R.2"],
        size: { x: 0.6, y: 0.6 },
        isResistor: true,
      },
    },
    chipPinMap: {
      "ANCHOR_A.1": {
        pinId: "ANCHOR_A.1",
        offset: { x: -0.3, y: 0 },
        side: "x-",
      },
      "ANCHOR_A.2": {
        pinId: "ANCHOR_A.2",
        offset: { x: 0.3, y: 0 },
        side: "x+",
      },
      "R.1": {
        pinId: "R.1",
        offset: { x: -0.3, y: 0 },
        side: "x-",
      },
      "R.2": {
        pinId: "R.2",
        offset: { x: 0.3, y: 0 },
        side: "x+",
      },
    },
    netMap: { SIGNAL: { netId: "SIGNAL" } },
    netConnMap: {},
    pinStrongConnMap: {},
    chipGap: 0.2,
    partitionGap: 1.2,
  }
  const chipPlacements: Record<ChipId, Placement> = {
    ANCHOR_A: { x: 0, y: 0, ccwRotationDegrees: 0 },
    R: { x: 2, y: -0.5, ccwRotationDegrees: 0 },
  }
  const pinToNetworkMap = new Map<PinId, NetId>([
    ["ANCHOR_A.2", "SIGNAL"],
    ["R.1", "SIGNAL"],
  ])
  return { inputProblem, chipPlacements, pinToNetworkMap }
}

test("aligns a resistor on a two-pin network without changing x or rotation", () => {
  const alignmentCase = createCase()
  alignResistorsWithFacingTwoPinComponents(alignmentCase)

  expect(alignmentCase.chipPlacements.R).toEqual({
    x: 2,
    y: 0,
    ccwRotationDegrees: 0,
  })
})

test("uses rotated pin sides when selecting a facing pair", () => {
  const alignmentCase = createCase()
  alignmentCase.chipPlacements.ANCHOR_A = {
    x: 0,
    y: 0,
    ccwRotationDegrees: 180,
  }
  alignmentCase.chipPlacements.R = {
    x: 2,
    y: -0.5,
    ccwRotationDegrees: 180,
  }
  alignmentCase.pinToNetworkMap = new Map([
    ["ANCHOR_A.1", "SIGNAL"],
    ["R.2", "SIGNAL"],
  ])

  alignResistorsWithFacingTwoPinComponents(alignmentCase)

  expect(alignmentCase.chipPlacements.R).toEqual({
    x: 2,
    y: 0,
    ccwRotationDegrees: 180,
  })
})

test("does not move a fixed resistor", () => {
  const alignmentCase = createCase()
  alignmentCase.inputProblem.chipMap.R!.fixedPosition = { x: 2, y: -0.5 }
  alignResistorsWithFacingTwoPinComponents(alignmentCase)

  expect(alignmentCase.chipPlacements.R!.y).toBe(-0.5)
})

test("does not align pins that do not mutually face", () => {
  const alignmentCase = createCase()
  alignmentCase.inputProblem.chipPinMap["ANCHOR_A.2"]!.side = "x-"
  alignResistorsWithFacingTwoPinComponents(alignmentCase)

  expect(alignmentCase.chipPlacements.R!.y).toBe(-0.5)
})

test("does not align a connection that is primarily vertical", () => {
  const alignmentCase = createCase()
  alignmentCase.inputProblem.chipGap = 0.1
  alignmentCase.chipPlacements.R = {
    x: 0.8,
    y: -1,
    ccwRotationDegrees: 0,
  }
  alignResistorsWithFacingTwoPinComponents(alignmentCase)

  expect(alignmentCase.chipPlacements.R.y).toBe(-1)
})

test("rejects an alignment that would violate chip clearance", () => {
  const alignmentCase = createCase()
  alignmentCase.inputProblem.chipMap.BLOCKER = {
    chipId: "BLOCKER",
    pins: [],
    size: { x: 0.6, y: 0.6 },
  }
  alignmentCase.chipPlacements.BLOCKER = {
    x: 2,
    y: 0.7,
    ccwRotationDegrees: 0,
  }
  alignResistorsWithFacingTwoPinComponents(alignmentCase)

  expect(alignmentCase.chipPlacements.R!.y).toBe(-0.5)
})

test("rejects an alignment when a component blocks the straight segment", () => {
  const alignmentCase = createCase()
  alignmentCase.inputProblem.chipMap.BLOCKER = {
    chipId: "BLOCKER",
    pins: [],
    size: { x: 0.2, y: 0.2 },
  }
  alignmentCase.chipPlacements.BLOCKER = {
    x: 1,
    y: 0,
    ccwRotationDegrees: 0,
  }
  alignResistorsWithFacingTwoPinComponents(alignmentCase)

  expect(alignmentCase.chipPlacements.R!.y).toBe(-0.5)
})

const addSecondEquidistantAnchor = (
  alignmentCase: ReturnType<typeof createCase>,
) => {
  alignmentCase.inputProblem.chipMap.ANCHOR_B = {
    chipId: "ANCHOR_B",
    pins: ["ANCHOR_B.1", "ANCHOR_B.2"],
    size: { x: 0.6, y: 0.6 },
  }
  alignmentCase.inputProblem.chipPinMap["ANCHOR_B.1"] = {
    pinId: "ANCHOR_B.1",
    offset: { x: -0.3, y: 0 },
    side: "x-",
  }
  alignmentCase.inputProblem.chipPinMap["ANCHOR_B.2"] = {
    pinId: "ANCHOR_B.2",
    offset: { x: 0.3, y: 0 },
    side: "x+",
  }
  alignmentCase.chipPlacements.ANCHOR_B = {
    x: 0,
    y: -1,
    ccwRotationDegrees: 0,
  }
  alignmentCase.pinToNetworkMap.set("ANCHOR_B.2", "SIGNAL")
}

test("selects the same closest candidate regardless of map order", () => {
  const normalOrder = createCase()
  const reversedOrder = createCase()
  addSecondEquidistantAnchor(normalOrder)
  addSecondEquidistantAnchor(reversedOrder)
  reversedOrder.inputProblem.chipMap = Object.fromEntries(
    Object.entries(reversedOrder.inputProblem.chipMap).reverse(),
  )
  reversedOrder.pinToNetworkMap = new Map(
    [...reversedOrder.pinToNetworkMap].reverse(),
  )

  alignResistorsWithFacingTwoPinComponents(normalOrder)
  alignResistorsWithFacingTwoPinComponents(reversedOrder)

  expect(normalOrder.chipPlacements.R!.y).toBe(0)
  expect(reversedOrder.chipPlacements.R!.y).toBe(0)
})
