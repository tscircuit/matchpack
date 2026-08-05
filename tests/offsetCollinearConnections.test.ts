import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem, PinId } from "../lib/types/InputProblem"
import type { OutputLayout } from "../lib/types/OutputLayout"
import { rotatePinOffset } from "../lib/utils/rotatePinOffset"
import chipPortInput from "./assets/chip-port-without-portarrangement.input.json"
import repro44Input from "./assets/repro44-e2e-pack-and-schematic.input.json"
import bootResetInput from "./assets/schematic-section-rp2040-boot-reset.input.json"
import polarizedCapacitorInput from "./assets/polarized-capacitor-auto-layout.input.json"
import bq24074RightResistorsInput from "./assets/repro-bq24074-right-resistors.input.json"

const getAbsolutePinPosition = (
  inputProblem: InputProblem,
  outputLayout: OutputLayout,
  pinId: PinId,
) => {
  const chip = Object.values(inputProblem.chipMap).find((chip) =>
    chip.pins.includes(pinId),
  )!
  const pin = inputProblem.chipPinMap[pinId]!
  const placement = outputLayout.chipPlacements[chip.chipId]!
  const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
  return {
    x: placement.x + offset.x,
    y: placement.y + offset.y,
  }
}

const solve = (inputProblem: InputProblem) => {
  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  return solver.getOutputLayout()
}

test("offsets vertical direct connections to the left", () => {
  const inputProblem = chipPortInput as InputProblem
  const outputLayout = solve(inputProblem)
  const mainPin = getAbsolutePinPosition(inputProblem, outputLayout, "U1.1")
  const diodePin = getAbsolutePinPosition(inputProblem, outputLayout, "D1.1")

  expect(diodePin.x - mainPin.x).toBeCloseTo(-0.2)
})

test("offsets only chip-anchored collinear connections", () => {
  const inputProblem = repro44Input as InputProblem
  const outputLayout = solve(inputProblem)

  const u1Pin5 = getAbsolutePinPosition(inputProblem, outputLayout, "U1.5")
  const c2Pin1 = getAbsolutePinPosition(inputProblem, outputLayout, "C2.1")
  expect(c2Pin1.y - u1Pin5.y).toBeCloseTo(-0.2)

  const u1Pin6 = getAbsolutePinPosition(inputProblem, outputLayout, "U1.6")
  const c1Pin1 = getAbsolutePinPosition(inputProblem, outputLayout, "C1.1")
  expect(c1Pin1.x - u1Pin6.x).toBeCloseTo(-0.2)

  const r3Pin2 = getAbsolutePinPosition(inputProblem, outputLayout, "R3.2")
  const d1Pin1 = getAbsolutePinPosition(inputProblem, outputLayout, "D1.1")
  expect(r3Pin2.x - d1Pin1.x).toBeCloseTo(-0.2)

  expect(outputLayout.chipPlacements.R2!.x).toBeCloseTo(0.9)
})

test("keeps a standalone rail-to-ground chain in one line", () => {
  const inputProblem = bootResetInput as InputProblem
  const outputLayout = solve(inputProblem)
  const resistorPin = getAbsolutePinPosition(inputProblem, outputLayout, "R2.2")
  const switchPin = getAbsolutePinPosition(inputProblem, outputLayout, "SW3.1")

  expect(resistorPin.x).toBeCloseTo(switchPin.x)
})

test("preserves direct trace clearance after reflowing a passive row", () => {
  const inputProblem = polarizedCapacitorInput as InputProblem
  const outputLayout = solve(inputProblem)
  const mainPin = getAbsolutePinPosition(inputProblem, outputLayout, "U1.1")
  const c1Pin = getAbsolutePinPosition(inputProblem, outputLayout, "C1.1")
  const c2Pin = getAbsolutePinPosition(inputProblem, outputLayout, "C2.1")

  expect(c1Pin.y - mainPin.y).toBeCloseTo(-0.2)
  expect(c2Pin.y - mainPin.y).toBeCloseTo(-0.2)
  expect(c1Pin.y).toBeCloseTo(c2Pin.y)
})

test("offsets a reflowed passive row as a rigid group", () => {
  const inputProblem = bq24074RightResistorsInput as InputProblem
  const outputLayout = solve(inputProblem)
  const mainPin = getAbsolutePinPosition(inputProblem, outputLayout, "U1.14")
  const r3Pin = getAbsolutePinPosition(inputProblem, outputLayout, "R3.1")
  const rowY = outputLayout.chipPlacements.R3!.y

  expect(r3Pin.y - mainPin.y).toBeCloseTo(-0.2)
  expect(outputLayout.chipPlacements.R1!.y).toBeCloseTo(rowY)
  expect(outputLayout.chipPlacements.R2!.y).toBeCloseTo(rowY)
})
