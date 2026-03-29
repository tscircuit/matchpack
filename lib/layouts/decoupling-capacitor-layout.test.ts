import { describe, it, expect } from "vitest"
import {
  layoutDecouplingCapacitors,
  filterDecouplingPins,
  isPowerNet,
  type ComponentBounds,
  type PinInfo,
} from "./decoupling-capacitor-layout"

// ---------------------------------------------------------------------------
// isPowerNet
// ---------------------------------------------------------------------------
describe("isPowerNet", () => {
  it("matches common power nets", () => {
    expect(isPowerNet("VDD")).toBe(true)
    expect(isPowerNet("VCC")).toBe(true)
    expect(isPowerNet("GND")).toBe(true)
    expect(isPowerNet("VSS")).toBe(true)
    expect(isPowerNet("AVDD")).toBe(true)
    expect(isPowerNet("DVDD")).toBe(true)
    expect(isPowerNet("3V3")).toBe(true)
    expect(isPowerNet("1V8")).toBe(true)
  })

  it("does not match signal nets", () => {
    expect(isPowerNet("CLK")).toBe(false)
    expect(isPowerNet("MISO")).toBe(false)
    expect(isPowerNet("GPIO0")).toBe(false)
    expect(isPowerNet("TX")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// filterDecouplingPins
// ---------------------------------------------------------------------------
describe("filterDecouplingPins", () => {
  const pins: PinInfo[] = [
    { pinNumber: 1, net: "VDD", position: { x: 0, y: 2 }, side: "top" },
    { pinNumber: 2, net: "CLK", position: { x: 1, y: 2 }, side: "top" },
    { pinNumber: 3, net: "GND", position: { x: 0, y: -2 }, side: "bottom" },
    { pinNumber: 4, net: "MISO", position: { x: -2, y: 0 }, side: "left" },
  ]

  it("returns only power / ground pins", () => {
    const filtered = filterDecouplingPins(pins)
    expect(filtered).toHaveLength(2)
    expect(filtered.map((p) => p.net)).toEqual(["VDD", "GND"])
  })
})

// ---------------------------------------------------------------------------
// layoutDecouplingCapacitors — basic geometry
// ---------------------------------------------------------------------------
describe("layoutDecouplingCapacitors", () => {
  const chip: ComponentBounds = {
    centre: { x: 0, y: 0 },
    width: 4, // ±2 mm from centre
    height: 4,
  }

  it("places a top-side cap above the chip", () => {
    const pins: PinInfo[] = [
      { pinNumber: 1, net: "VDD", position: { x: 0, y: 2 }, side: "top" },
    ]
    const [placement] = layoutDecouplingCapacitors(chip, pins)
    expect(placement.position.y).toBeGreaterThan(2) // above chip edge
    expect(placement.rotation).toBe(0)
  })

  it("places a bottom-side cap below the chip", () => {
    const pins: PinInfo[] = [
      { pinNumber: 5, net: "GND", position: { x: 0, y: -2 }, side: "bottom" },
    ]
    const [placement] = layoutDecouplingCapacitors(chip, pins)
    expect(placement.position.y).toBeLessThan(-2)
    expect(placement.rotation).toBe(0)
  })

  it("places a left-side cap to the left of the chip", () => {
    const pins: PinInfo[] = [
      { pinNumber: 9, net: "VCC", position: { x: -2, y: 0 }, side: "left" },
    ]
    const [placement] = layoutDecouplingCapacitors(chip, pins)
    expect(placement.position.x).toBeLessThan(-2)
    expect(placement.rotation).toBe(90)
  })

  it("places a right-side cap to the right of the chip", () => {
    const pins: PinInfo[] = [
      { pinNumber: 13, net: "VDD", position: { x: 2, y: 0 }, side: "right" },
    ]
    const [placement] = layoutDecouplingCapacitors(chip, pins)
    expect(placement.position.x).toBeGreaterThan(2)
    expect(placement.rotation).toBe(90)
  })

  it("respects chipToCapGap option", () => {
    const pins: PinInfo[] = [
      { pinNumber: 1, net: "VDD", position: { x: 0, y: 2 }, side: "top" },
    ]
    const gapSmall = layoutDecouplingCapacitors(chip, pins, {
      chipToCapGap: 0.25,
    })
    const gapLarge = layoutDecouplingCapacitors(chip, pins, {
      chipToCapGap: 1.0,
    })
    expect(gapLarge[0].position.y).toBeGreaterThan(gapSmall[0].position.y)
  })

  it("assigns unique cap IDs based on pin number", () => {
    const pins: PinInfo[] = [
      { pinNumber: 2, net: "VDD", position: { x: -1, y: 2 }, side: "top" },
      { pinNumber: 6, net: "VDD", position: { x: 1, y: 2 }, side: "top" },
    ]
    const placements = layoutDecouplingCapacitors(chip, pins)
    expect(placements[0].capId).toBe("C_2")
    expect(placements[1].capId).toBe("C_6")
  })

  it("prevents overlapping caps on the same side", () => {
    const spacing = 0.8
    const pins: PinInfo[] = [
      { pinNumber: 1, net: "VDD", position: { x: 0, y: 2 }, side: "top" },
      { pinNumber: 2, net: "VCC", position: { x: 0.1, y: 2 }, side: "top" }, // almost same X
    ]
    const placements = layoutDecouplingCapacitors(chip, pins, {
      capSpacing: spacing,
    })
    const dx = Math.abs(placements[1].position.x - placements[0].position.x)
    expect(dx).toBeGreaterThanOrEqual(spacing - 1e-6)
  })

  it("handles mixed-side pins correctly", () => {
    const pins: PinInfo[] = [
      { pinNumber: 1, net: "VDD", position: { x: -1, y: 2 }, side: "top" },
      { pinNumber: 5, net: "GND", position: { x: -2, y: -0.5 }, side: "left" },
      { pinNumber: 9, net: "VCC", position: { x: 1, y: -2 }, side: "bottom" },
      { pinNumber: 13, net: "VSS", position: { x: 2, y: 0.5 }, side: "right" },
    ]
    const placements = layoutDecouplingCapacitors(chip, pins)
    expect(placements).toHaveLength(4)

    const byPin = Object.fromEntries(placements.map((p) => [p.pinNumber, p]))

    // top cap is above chip
    expect(byPin[1].position.y).toBeGreaterThan(2)
    // left cap is to the left
    expect(byPin[5].position.x).toBeLessThan(-2)
    // bottom cap is below chip
    expect(byPin[9].position.y).toBeLessThan(-2)
    // right cap is to the right
    expect(byPin[13].position.x).toBeGreaterThan(2)
  })
})
