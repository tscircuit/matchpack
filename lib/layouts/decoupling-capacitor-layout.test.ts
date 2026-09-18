/**
 * Unit tests for decoupling-capacitor layout helpers.
 *
 * Run with:  npx vitest run lib/layouts/decoupling-capacitor-layout.test.ts
 */

import { describe, it, expect } from "vitest"
import {
  isPowerNet,
  filterDecouplingPins,
  layoutDecouplingCapacitors,
  POWER_NET_PATTERNS,
  type PinInfo,
} from "./decoupling-capacitor-layout"

// ---------------------------------------------------------------------------
// isPowerNet
// ---------------------------------------------------------------------------

describe("isPowerNet", () => {
  // Standard supply rails
  it.each([
    "VCC",
    "vcc",
    "VDD",
    "vdd",
    "VDD_3V3",
    "VSS",
    "vss",
    "VBAT",
    "V3V3",
    "V5V",
    "V1V8",
    "VBUS",
    "VSYS",
    "VMAIN",
    "VCORE",
    "VIO",
    "VREF",
    "VANA",
    "VDIG",
  ])("returns true for supply rail '%s'", (name) => {
    expect(isPowerNet(name)).toBe(true)
  })

  // Ground variants (standard)
  it.each(["GND", "gnd"])("returns true for standard ground '%s'", (name) => {
    expect(isPowerNet(name)).toBe(true)
  })

  // Ground variants — analogue, digital, power-ground (the gap flagged in review)
  it.each([
    "AGND",
    "agnd",
    "AGND_ISO",
    "DGND",
    "dgnd",
    "PGND",
    "pgnd",
    "SGND",
    "EGND",
    "GNDD",
    "GNDA",
  ])(
    "returns true for specialised ground rail '%s'",
    (name) => {
      expect(isPowerNet(name)).toBe(true)
    },
  )

  // VSS variants
  it.each(["AVSS", "avss", "DVSS", "dvss"])(
    "returns true for VSS variant '%s'",
    (name) => {
      expect(isPowerNet(name)).toBe(true)
    },
  )

  // Signal nets that should NOT match
  it.each([
    "SDA",
    "SCL",
    "MOSI",
    "MISO",
    "CS",
    "INT",
    "RST",
    "LED",
    "TX",
    "RX",
    "CLK",
    "DATA",
  ])("returns false for signal net '%s'", (name) => {
    expect(isPowerNet(name)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// filterDecouplingPins
// ---------------------------------------------------------------------------

describe("filterDecouplingPins", () => {
  const makePins = (nets: string[]): PinInfo[] =>
    nets.map((net, i) => ({
      pinNumber: i + 1,
      net,
      position: { x: 0, y: 0 },
      side: "top" as const,
    }))

  it("keeps only power-net pins", () => {
    const pins = makePins(["VDD", "SDA", "GND", "CLK", "AGND", "DGND"])
    const result = filterDecouplingPins(pins)
    expect(result.map((p) => p.net)).toEqual(["VDD", "GND", "AGND", "DGND"])
  })

  it("returns empty array when no power nets", () => {
    const pins = makePins(["SDA", "SCL", "MOSI", "MISO"])
    expect(filterDecouplingPins(pins)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// layoutDecouplingCapacitors
// ---------------------------------------------------------------------------

describe("layoutDecouplingCapacitors", () => {
  it("places a single top-side decap outward from the IC pin", () => {
    const map = new Map<string, PinInfo>([
      [
        "C1",
        {
          pinNumber: 1,
          net: "VDD",
          position: { x: 5, y: 10 },
          side: "top",
        },
      ],
    ])

    const [p] = layoutDecouplingCapacitors(map, { clearance: 0.5 })
    expect(p.componentId).toBe("C1")
    // Should be placed 0.5 mm above the pin (positive Y = outward from top).
    expect(p.position.x).toBeCloseTo(5)
    expect(p.position.y).toBeCloseTo(10.5)
    expect(p.rotation).toBe(90)
    expect(p.side).toBe("top")
    expect(p.net).toBe("VDD")
  })

  it("places a bottom-side decap outward (negative Y)", () => {
    const map = new Map<string, PinInfo>([
      [
        "C2",
        {
          pinNumber: 2,
          net: "GND",
          position: { x: 3, y: -8 },
          side: "bottom",
        },
      ],
    ])

    const [p] = layoutDecouplingCapacitors(map, { clearance: 0.5 })
    expect(p.position.x).toBeCloseTo(3)
    expect(p.position.y).toBeCloseTo(-8.5)
    expect(p.rotation).toBe(90)
  })

  it("places a right-side decap outward (positive X)", () => {
    const map = new Map<string, PinInfo>([
      [
        "C3",
        {
          pinNumber: 3,
          net: "VCC",
          position: { x: 7, y: 2 },
          side: "right",
        },
      ],
    ])

    const [p] = layoutDecouplingCapacitors(map, { clearance: 1.0 })
    expect(p.position.x).toBeCloseTo(8)
    expect(p.position.y).toBeCloseTo(2)
    expect(p.rotation).toBe(0)
  })

  it("places a left-side decap outward (negative X)", () => {
    const map = new Map<string, PinInfo>([
      [
        "C4",
        {
          pinNumber: 4,
          net: "AGND",
          position: { x: -5, y: 1 },
          side: "left",
        },
      ],
    ])

    const [p] = layoutDecouplingCapacitors(map, { clearance: 0.5 })
    expect(p.position.x).toBeCloseTo(-5.5)
    expect(p.position.y).toBeCloseTo(1)
    expect(p.rotation).toBe(0)
  })

  it("stacks multiple decaps on the same side without overlap", () => {
    const map = new Map<string, PinInfo>([
      [
        "C5",
        {
          pinNumber: 5,
          net: "DGND",
          position: { x: 0, y: 5 },
          side: "top",
        },
      ],
      [
        "C6",
        {
          pinNumber: 6,
          net: "PGND",
          position: { x: 0, y: 5 },
          side: "top",
        },
      ],
    ])

    const ps = layoutDecouplingCapacitors(map, { clearance: 0.5, step: 1.0 })
    expect(ps).toHaveLength(2)
    // First row: 0.5 mm out; second row: 1.5 mm out.
    const ys = ps.map((p) => p.position.y).sort((a, b) => a - b)
    expect(ys[0]).toBeCloseTo(5.5)
    expect(ys[1]).toBeCloseTo(6.5)
  })

  it("returns an empty array for an empty map", () => {
    expect(layoutDecouplingCapacitors(new Map())).toHaveLength(0)
  })

  it("handles AGND as a valid net name (regression for review comment)", () => {
    const map = new Map<string, PinInfo>([
      [
        "C7",
        {
          pinNumber: 7,
          net: "AGND",
          position: { x: 1, y: 2 },
          side: "bottom",
        },
      ],
    ])
    const [p] = layoutDecouplingCapacitors(map)
    expect(p.net).toBe("AGND")
    expect(p.componentId).toBe("C7")
  })
})
