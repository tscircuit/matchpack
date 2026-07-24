import { describe, it, expect } from "vitest"
import {
  computeDecouplingCapGroupLayout,
  computeMultiIcDecouplingLayout,
} from "../src/layouts/decoupling-cap-group-layout"

describe("computeDecouplingCapGroupLayout", () => {
  it("returns empty array for zero capacitors", () => {
    const result = computeDecouplingCapGroupLayout(
      { x: 0, y: 0, width: 5, height: 5 },
      0,
    )
    expect(result).toEqual([])
  })

  it("places a single cap directly below the IC on the bottom side", () => {
    const ic = { x: 0, y: 0, width: 4, height: 4 }
    const [cap] = computeDecouplingCapGroupLayout(ic, 1, { side: "bottom" })

    // Cap should be below IC center
    expect(cap.x).toBeCloseTo(0, 5)
    // y should be negative (below) for bottom placement
    expect(cap.y).toBeLessThan(0)
    expect(cap.rotation).toBe(0)
  })

  it("places a single cap directly above the IC on the top side", () => {
    const ic = { x: 0, y: 0, width: 4, height: 4 }
    const [cap] = computeDecouplingCapGroupLayout(ic, 1, { side: "top" })

    expect(cap.x).toBeCloseTo(0, 5)
    expect(cap.y).toBeGreaterThan(0)
    expect(cap.rotation).toBe(0)
  })

  it("places caps in a centered row below the IC", () => {
    const ic = { x: 0, y: 0, width: 6, height: 4 }
    const caps = computeDecouplingCapGroupLayout(ic, 3, {
      side: "bottom",
      capFootprintWidth: 0.65,
      capSpacingMm: 0.2,
    })

    expect(caps).toHaveLength(3)

    // All caps should share the same Y
    const yValues = caps.map((c) => c.y)
    expect(yValues[0]).toBeCloseTo(yValues[1], 5)
    expect(yValues[1]).toBeCloseTo(yValues[2], 5)

    // X values should be evenly spaced
    const xStep = caps[1].x - caps[0].x
    const xStep2 = caps[2].x - caps[1].x
    expect(xStep).toBeCloseTo(xStep2, 5)

    // Group should be centered around IC center (x=0)
    const groupCenterX = (caps[0].x + caps[2].x) / 2
    expect(groupCenterX).toBeCloseTo(0, 5)
  })

  it("places caps in a column on the right side with 90° rotation", () => {
    const ic = { x: 0, y: 0, width: 4, height: 6 }
    const caps = computeDecouplingCapGroupLayout(ic, 2, {
      side: "right",
      capFootprintWidth: 0.65,
      capFootprintHeight: 1.0,
      capSpacingMm: 0.2,
    })

    expect(caps).toHaveLength(2)
    // All caps should share the same X (same column)
    expect(caps[0].x).toBeCloseTo(caps[1].x, 5)
    // Caps should be to the right of IC
    expect(caps[0].x).toBeGreaterThan(0)
    // Rotation should be 90° for vertical placement
    expect(caps[0].rotation).toBe(90)
  })

  it("respects custom margin and spacing", () => {
    const ic = { x: 0, y: 0, width: 4, height: 4 }
    const margin = 1.0
    const spacing = 0.5

    const caps = computeDecouplingCapGroupLayout(ic, 2, {
      side: "bottom",
      marginMm: margin,
      capSpacingMm: spacing,
      capFootprintWidth: 0.65,
      capFootprintHeight: 1.0,
    })

    expect(caps).toHaveLength(2)

    // Gap between caps should equal spacing + capWidth
    const xGap = caps[1].x - caps[0].x
    expect(xGap).toBeCloseTo(0.65 + spacing, 5)

    // Y should be at least margin + halfIC + halfCap below center
    const expectedY = -(4 / 2 + margin + 1.0 / 2)
    expect(caps[0].y).toBeCloseTo(expectedY, 5)
  })

  it("preserves IC layer in placement output", () => {
    const ic = { x: 0, y: 0, width: 4, height: 4, layer: "bottom" }
    const [cap] = computeDecouplingCapGroupLayout(ic, 1)
    expect(cap.layer).toBe("bottom")
  })

  it("offsets placement when IC is not at origin", () => {
    const ic = { x: 10, y: 20, width: 4, height: 4 }
    const [cap] = computeDecouplingCapGroupLayout(ic, 1, { side: "bottom" })

    // Cap center X should track IC center X
    expect(cap.x).toBeCloseTo(10, 5)
    // Cap should be below IC (y less than ic.y)
    expect(cap.y).toBeLessThan(20)
  })
})

describe("computeMultiIcDecouplingLayout", () => {
  it("handles multiple ICs each with their own cap groups", () => {
    const groups = [
      { ic: { x: 0, y: 0, width: 4, height: 4 }, capCount: 2 },
      { ic: { x: 10, y: 0, width: 6, height: 6 }, capCount: 4 },
    ]

    const result = computeMultiIcDecouplingLayout(groups, { side: "bottom" })

    // Total placements = 2 + 4 = 6
    expect(result).toHaveLength(6)

    // First 2 belong to group 0
    const group0 = result.filter((r) => r.groupIndex === 0)
    expect(group0).toHaveLength(2)

    // Next 4 belong to group 1
    const group1 = result.filter((r) => r.groupIndex === 1)
    expect(group1).toHaveLength(4)

    // Group 0 caps should be near x=0
    for (const { placement } of group0) {
      expect(Math.abs(placement.x)).toBeLessThan(3)
    }

    // Group 1 caps should be near x=10
    for (const { placement } of group1) {
      expect(Math.abs(placement.x - 10)).toBeLessThan(5)
    }
  })

  it("respects per-group preferred side override", () => {
    const groups = [
      {
        ic: { x: 0, y: 0, width: 4, height: 4 },
        capCount: 2,
        preferredSide: "right" as const,
      },
    ]

    const result = computeMultiIcDecouplingLayout(groups, { side: "bottom" })

    // Despite sharedOptions.side = "bottom", this group should use "right"
    for (const { placement } of result) {
      expect(placement.x).toBeGreaterThan(0)
      expect(placement.rotation).toBe(90)
    }
  })
})
