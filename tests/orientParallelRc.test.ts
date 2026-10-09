import { expect, test } from "bun:test"
import { orientParallelRc } from "../lib/solvers/OrientParallelRcSolver/orientParallelRc"
import type { InputProblem } from "../lib/types/InputProblem"
import type { OutputLayout } from "../lib/types/OutputLayout"
import { rotatePinOffset } from "../lib/utils/rotatePinOffset"

const createParallelRc = () => {
  const inputProblem: InputProblem = {
    chipMap: {
      resistor: {
        chipId: "resistor",
        pins: ["resistor.a", "resistor.b"],
        size: { x: 1, y: 0.4 },
        isResistor: true,
      },
      capacitor: {
        chipId: "capacitor",
        pins: ["capacitor.a", "capacitor.b"],
        size: { x: 0.8, y: 0.5 },
        isCapacitor: true,
        availableRotations: [0, 90, 180, 270],
      },
    },
    chipPinMap: {
      "resistor.a": {
        pinId: "resistor.a",
        offset: { x: -0.5, y: 0 },
        side: "x-",
      },
      "resistor.b": {
        pinId: "resistor.b",
        offset: { x: 0.5, y: 0 },
        side: "x+",
      },
      "capacitor.a": {
        pinId: "capacitor.a",
        offset: { x: -0.4, y: 0 },
        side: "x-",
      },
      "capacitor.b": {
        pinId: "capacitor.b",
        offset: { x: 0.4, y: 0 },
        side: "x+",
      },
    },
    netMap: { gate: { netId: "gate" }, drain: { netId: "drain" } },
    netConnMap: {
      "resistor.a-gate": true,
      "resistor.b-drain": true,
      "capacitor.a-drain": true,
      "capacitor.b-gate": true,
    },
    pinStrongConnMap: {},
    chipGap: 0.2,
    partitionGap: 1,
  }
  const inputLayout: OutputLayout = {
    chipPlacements: {
      resistor: { x: 0, y: 0, ccwRotationDegrees: 0 },
      capacitor: { x: -0.2, y: -2, ccwRotationDegrees: 0 },
    },
    groupPlacements: {},
  }
  return { inputProblem, inputLayout }
}

const createParallelRcWithAnchor = (capacitorPinId = "capacitor.a") => {
  const { inputProblem, inputLayout } = createParallelRc()
  const anchorX = capacitorPinId === "capacitor.a" ? -2 : 2
  inputProblem.chipMap.anchor = {
    chipId: "anchor",
    pins: ["anchor.1"],
    size: { x: 1, y: 1 },
    fixedPosition: { x: anchorX, y: -2 },
  }
  inputProblem.chipPinMap["anchor.1"] = {
    pinId: "anchor.1",
    offset: { x: anchorX < 0 ? 0.5 : -0.5, y: 0 },
    side: anchorX < 0 ? "x+" : "x-",
  }
  const netId = capacitorPinId === "capacitor.a" ? "drain" : "gate"
  inputProblem.netConnMap[`anchor.1-${netId}`] = true
  inputLayout.chipPlacements.anchor = {
    x: anchorX,
    y: -2,
    ccwRotationDegrees: 0,
  }
  return { inputProblem, inputLayout }
}

test.each([0, 90, 180, 270])(
  "orients corresponding RC terminals with the circuit rotated %i degrees",
  (ccwRotationDegrees) => {
    const { inputProblem, inputLayout } = createParallelRc()
    for (const placement of Object.values(inputLayout.chipPlacements)) {
      Object.assign(placement, rotatePinOffset(placement, ccwRotationDegrees))
      placement.ccwRotationDegrees = ccwRotationDegrees
    }
    const originalProblem = structuredClone(inputProblem)
    const originalLayout = structuredClone(inputLayout)
    const outputLayout = orientParallelRc(inputProblem, inputLayout)
    expect(outputLayout.chipPlacements.capacitor).toEqual({
      ...inputLayout.chipPlacements.capacitor!,
      ccwRotationDegrees: (ccwRotationDegrees + 180) % 360,
    })
    expect(outputLayout.chipPlacements.resistor).toEqual(
      inputLayout.chipPlacements.resistor,
    )
    expect(inputProblem).toEqual(originalProblem)
    expect(inputLayout).toEqual(originalLayout)
    expect(orientParallelRc(inputProblem, outputLayout)).toEqual(outputLayout)
  },
)

test("uses connectivity, not pin order", () => {
  const { inputProblem, inputLayout } = createParallelRc()
  inputProblem.chipMap.capacitor!.pins.reverse()
  inputProblem.chipMap.resistor!.pins.reverse()
  expect(
    orientParallelRc(inputProblem, inputLayout).chipPlacements.capacitor!
      .ccwRotationDegrees,
  ).toBe(180)
})

test("leaves already aligned corresponding terminals alone", () => {
  const { inputProblem, inputLayout } = createParallelRc()
  inputLayout.chipPlacements.capacitor!.ccwRotationDegrees = 180
  expect(orientParallelRc(inputProblem, inputLayout)).toEqual(inputLayout)
})

test("leaves matching pin-to-net order alone", () => {
  const { inputProblem, inputLayout } = createParallelRc()
  inputProblem.netConnMap = {
    "resistor.a-gate": true,
    "resistor.b-drain": true,
    "capacitor.a-gate": true,
    "capacitor.b-drain": true,
  }
  expect(orientParallelRc(inputProblem, inputLayout)).toEqual(inputLayout)
})

test("preserves fixed capacitor placement", () => {
  const { inputProblem, inputLayout } = createParallelRc()
  inputProblem.chipMap.capacitor!.fixedPosition = { x: -0.2, y: -2 }
  expect(orientParallelRc(inputProblem, inputLayout)).toEqual(inputLayout)
})

test("respects available rotations", () => {
  const { inputProblem, inputLayout } = createParallelRc()
  inputProblem.chipMap.capacitor!.availableRotations = [0, 90]
  expect(orientParallelRc(inputProblem, inputLayout)).toEqual(inputLayout)
})

test.each([
  { capacitorPinId: "capacitor.a", reverseConnection: false },
  { capacitorPinId: "capacitor.a", reverseConnection: true },
  { capacitorPinId: "capacitor.b", reverseConnection: false },
  { capacitorPinId: "capacitor.b", reverseConnection: true },
])(
  "preserves externally anchored capacitors: %o",
  ({ capacitorPinId, reverseConnection }) => {
    const { inputProblem, inputLayout } =
      createParallelRcWithAnchor(capacitorPinId)
    const pinPair: keyof InputProblem["pinStrongConnMap"] = reverseConnection
      ? `anchor.1-${capacitorPinId}`
      : `${capacitorPinId}-anchor.1`
    inputProblem.pinStrongConnMap[pinPair] = true
    expect(orientParallelRc(inputProblem, inputLayout)).toEqual(inputLayout)
  },
)

test.each<InputProblem["pinStrongConnMap"]>([
  { "capacitor.a-anchor.1": false, "anchor.1-capacitor.a": false },
  { "resistor.b-anchor.1": true },
  { "capacitor.a-resistor.b": true, "resistor.a-capacitor.b": true },
])(
  "allows orientation with non-anchoring connections: %o",
  (pinStrongConnMap) => {
    const { inputProblem, inputLayout } = createParallelRcWithAnchor()
    inputProblem.pinStrongConnMap = pinStrongConnMap
    expect(orientParallelRc(inputProblem, inputLayout)).toEqual({
      ...inputLayout,
      chipPlacements: {
        ...inputLayout.chipPlacements,
        capacitor: {
          ...inputLayout.chipPlacements.capacitor!,
          ccwRotationDegrees: 180,
        },
      },
    })
  },
)

test.each(["capacitor", "resistor"])(
  "does not infer component type from two pins: %s",
  (chipId) => {
    const { inputProblem, inputLayout } = createParallelRc()
    inputProblem.chipMap[chipId]!.isCapacitor = false
    inputProblem.chipMap[chipId]!.isResistor = false
    expect(orientParallelRc(inputProblem, inputLayout)).toEqual(inputLayout)
  },
)

test("skips asymmetric custom pin geometry", () => {
  const { inputProblem, inputLayout } = createParallelRc()
  inputProblem.chipPinMap["capacitor.a"]!.offset.x = -0.6
  expect(orientParallelRc(inputProblem, inputLayout)).toEqual(inputLayout)
})

test.each([
  { x: 0, y: 0, ccwRotationDegrees: 0 },
  { x: 2, y: 0, ccwRotationDegrees: 0 },
  { x: 2, y: -2, ccwRotationDegrees: 0 },
  { x: 0, y: -2, ccwRotationDegrees: 90 },
])("skips non-parallel placements: %o", (placement) => {
  const { inputProblem, inputLayout } = createParallelRc()
  inputLayout.chipPlacements.capacitor = placement
  expect(orientParallelRc(inputProblem, inputLayout)).toEqual(inputLayout)
})

test("skips a capacitor with an unconnected terminal", () => {
  const { inputProblem, inputLayout } = createParallelRc()
  delete inputProblem.netConnMap["capacitor.b-gate"]
  expect(orientParallelRc(inputProblem, inputLayout)).toEqual(inputLayout)
})

test("skips terminals attached to multiple named nets", () => {
  const { inputProblem, inputLayout } = createParallelRc()
  inputProblem.netConnMap["capacitor.b-drain"] = true
  expect(orientParallelRc(inputProblem, inputLayout)).toEqual(inputLayout)
})

test("skips shorted capacitor terminals", () => {
  const { inputProblem, inputLayout } = createParallelRc()
  delete inputProblem.netConnMap["capacitor.b-gate"]
  inputProblem.netConnMap["capacitor.b-drain"] = true
  expect(orientParallelRc(inputProblem, inputLayout)).toEqual(inputLayout)
})

test("skips ambiguous parallel resistors", () => {
  const { inputProblem, inputLayout } = createParallelRc()
  inputProblem.chipMap.other = {
    ...inputProblem.chipMap.resistor!,
    chipId: "other",
    pins: ["other.a", "other.b"],
  }
  inputProblem.netConnMap["other.a-gate"] = true
  inputProblem.netConnMap["other.b-drain"] = true
  expect(orientParallelRc(inputProblem, inputLayout)).toEqual(inputLayout)
})
