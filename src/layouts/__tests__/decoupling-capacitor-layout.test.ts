import { describe, it, expect } from "bun:test"
import {
  computeDecouplingCapacitorGridLayout,
  groupDecouplingCapacitorsByIC,
  applyDecouplingCapacitorLayout,
  type DecouplingCapacitorGroup,
} from "../decoupling-capacitor-layout"

describe("computeDecouplingCapacitorGridLayout", () => {
  it("places capacitors in a single row when count <= capsPerRow", () => {
    const group: DecouplingCapacitorGroup = {
      icId: "U1",
      icBounds: { center: { x: 0, y: 0 }, width: 6, height: 6 },
      capacitorIds: ["C1", "C2", "C3", "C4"],
    }

    const placements = computeDecouplingCapacitorGridLayout(group, {
      capSpacing: 0.5,
      capsPerRow: 4,
      offsetFromIC: 0.8,
      capWidth: 0.6,
      capHeight: 0.3,
      placementSide: "bottom",
    })

    expect(placements).toHaveLength(4)

    // All capacitors should be in the same row (same y coordinate)
    const yValues = placements.map((p) => p.y)
    expect(new Set(yValues).size).toBe(1)

    // Capacitors should be in ascending x order
    const xValues = placements.map((p) => p.x)
    for (let i = 1; i < xValues.length; i++) {
      expect(xValues[i]).toBeGreaterThan(xValues[i - 1])
    }
  })

  it("wraps to a second row when count > capsPerRow", () => {
    const group: DecouplingCapacitorGroup = {
      icId: "U1",
      icBounds: { center: { x: 0, y: 0 }, width: 6, height: 6 },
      capacitorIds: ["C1", "C2", "C3", "C4", "C5", "C6"],
    }

    const placements = computeDecouplingCapacitorGridLayout(group, {
      capSpacing: 0.5,
      capsPerRow: 4,
      offsetFromIC: 0.8,
      capWidth: 0.6,
      capHeight: 0.3,
      placementSide: "bottom",
    })

    expect(placements).toHaveLength(6)

    // First 4 should have same y (row 0), last 2 should have same y (row 1)
    const row0y = placements[0].y
    const row1y = placements[4].y

    expect(placements[0].y).toBeCloseTo(row0y)
    expect(placements[1].y).toBeCloseTo(row0y)
    expect(placements[2].y).toBeCloseTo(row0y)
    expect(placements[3].y).toBeCloseTo(row0y)
    expect(placements[4].y).toBeCloseTo(row1y)
    expect(placements[5].y).toBeCloseTo(row1y)

    // Row 1 should be below row 0 (smaller y in bottom placement)
    expect(row1y).toBeLessThan(row0y)
  })

  it("places capacitors below the IC (bottom side)", () => {
    const group: DecouplingCapacitorGroup = {
      icId: "U1",
      icBounds: { center: { x: 0, y: 0 }, width: 6, height: 6 },
      capacitorIds: ["C1"],
    }

    const placements = computeDecouplingCapacitorGridLayout(group, {
      offsetFromIC: 0.8,
      capHeight: 0.3,
      placementSide: "bottom",
    })

    expect(placements).toHaveLength(1)
    // Should be below IC: y < icCenter.y - icHeight/2
    expect(placements[0].y).toBeLessThan(0 - 3) // below IC bottom edge
  })

  it("places capacitors to the right of the IC (right side)", () => {
    const group: DecouplingCapacitorGroup = {
      icId: "U1",
      icBounds: { center: { x: 0, y: 0 }, width: 6, height: 6 },
      capacitorIds: ["C1"],
    }

    const placements = computeDecouplingCapacitorGridLayout(group, {
      offsetFromIC: 0.8,
      capHeight: 0.3,
      placementSide: "right",
    })

    expect(placements).toHaveLength(1)
    // Should be to the right of IC: x > icCenter.x + icWidth/2
    expect(placements[0].x).toBeGreaterThan(0 + 3) // right of IC edge
    // Rotation should be 90 degrees
    expect(placements[0].rotation).toBe(90)
  })

  it("centers the grid along the IC edge", () => {
    const group: DecouplingCapacitorGroup = {
      icId: "U1",
      icBounds: { center: { x: 10, y: 10 }, width: 6, height: 6 },
      capacitorIds: ["C1", "C2", "C3"],
    }

    const placements = computeDecouplingCapacitorGridLayout(group, {
      capSpacing: 0.5,
      capsPerRow: 4,
      capWidth: 0.6,
      placementSide: "bottom",
    })

    // The grid should be centered around icCenter.x = 10
    const xValues = placements.map((p) => p.x)
    const gridCenterX = (Math.min(...xValues) + Math.max(...xValues)) / 2
    expect(gridCenterX).toBeCloseTo(10, 1)
  })

  it("returns empty array for no capacitors", () => {
    const group: DecouplingCapacitorGroup = {
      icId: "U1",
      icBounds: { center: { x: 0, y: 0 }, width: 6, height: 6 },
      capacitorIds: [],
    }

    const placements = computeDecouplingCapacitorGridLayout(group)
    expect(placements).toHaveLength(0)
  })

  it("assigns correct componentIds to placements", () => {
    const group: DecouplingCapacitorGroup = {
      icId: "U1",
      icBounds: { center: { x: 0, y: 0 }, width: 6, height: 6 },
      capacitorIds: ["C1", "C2", "C3"],
    }

    const placements = computeDecouplingCapacitorGridLayout(group)
    const placedIds = placements.map((p) => p.componentId)
    expect(placedIds).toEqual(["C1", "C2", "C3"])
  })
})

describe("groupDecouplingCapacitorsByIC", () => {
  const components = [
    { id: "U1", name: "U1", type: "chip", ftype: "simple_chip" },
    { id: "U2", name: "U2", type: "chip", ftype: "simple_chip" },
    {
      id: "C1",
      name: "C1",
      type: "simple_capacitor",
      ftype: "simple_capacitor",
      value: "100nF",
    },
    {
      id: "C2",
      name: "C2",
      type: "simple_capacitor",
      ftype: "simple_capacitor",
      value: "100nF",
    },
    {
      id: "C3",
      name: "C3",
      type: "simple_capacitor",
      ftype: "simple_capacitor",
      value: "10uF",
    },
    { id: "R1", name: "R1", type: "resistor" },
  ]

  const netlist = [
    {
      netId: "net_vcc",
      netName: "VCC",
      componentIds: ["U1", "C1", "C2", "C3"],
    },
    {
      netId: "net_gnd",
      netName: "GND",
      componentIds: ["U1", "U2", "C1", "C2", "C3", "R1"],
    },
    { netId: "net_vdd", netName: "VDD", componentIds: ["U2", "C3"] },
    { netId: "net_sig", netName: "SIG1", componentIds: ["U1", "R1"] },
  ]

  it("groups decoupling caps with their associated IC", () => {
    const groups = groupDecouplingCapacitorsByIC(components, netlist)
    expect(groups.length).toBeGreaterThan(0)

    const u1Group = groups.find((g) => g.icId === "U1")
    expect(u1Group).toBeDefined()
    expect(u1Group!.capacitorIds).toContain("C1")
    expect(u1Group!.capacitorIds).toContain("C2")
  })

  it("does not include resistors as decoupling caps", () => {
    const groups = groupDecouplingCapacitorsByIC(components, netlist)
    for (const group of groups) {
      expect(group.capacitorIds).not.toContain("R1")
    }
  })

  it("handles ICs with no power connections gracefully", () => {
    const isolatedComponents = [
      { id: "U3", name: "U3", type: "chip", ftype: "simple_chip" },
    ]
    const isolatedNetlist = [
      { netId: "net_sig", netName: "SIG", componentIds: ["U3"] },
    ]
    const groups = groupDecouplingCapacitorsByIC(
      isolatedComponents,
      isolatedNetlist,
    )
    expect(groups).toHaveLength(0)
  })
})

describe("applyDecouplingCapacitorLayout", () => {
  it("returns a map of componentId to placement", () => {
    const groups: DecouplingCapacitorGroup[] = [
      {
        icId: "U1",
        icBounds: { center: { x: 0, y: 0 }, width: 6, height: 6 },
        capacitorIds: ["C1", "C2", "C3", "C4"],
      },
      {
        icId: "U2",
        icBounds: { center: { x: 20, y: 0 }, width: 8, height: 8 },
        capacitorIds: ["C5", "C6"],
      },
    ]

    const placements = applyDecouplingCapacitorLayout(groups)

    expect(placements.size).toBe(6)
    expect(placements.has("C1")).toBe(true)
    expect(placements.has("C5")).toBe(true)

    // C5 should be near U2 (x ~= 20)
    const c5 = placements.get("C5")!
    expect(c5.x).toBeGreaterThan(10) // clearly in U2's region
  })

  it("does not overlap capacitors from different IC groups", () => {
    const groups: DecouplingCapacitorGroup[] = [
      {
        icId: "U1",
        icBounds: { center: { x: 0, y: 0 }, width: 4, height: 4 },
        capacitorIds: ["C1", "C2"],
      },
      {
        icId: "U2",
        icBounds: { center: { x: 30, y: 0 }, width: 4, height: 4 },
        capacitorIds: ["C3", "C4"],
      },
    ]

    const placements = applyDecouplingCapacitorLayout(groups)

    const c1 = placements.get("C1")!
    const c3 = placements.get("C3")!

    // C1 and C3 should be far apart (different IC groups at x=0 and x=30)
    const dist = Math.sqrt(
      (c1.x - c3.x) ** 2 + (c1.y - c3.y) ** 2,
    )
    expect(dist).toBeGreaterThan(10)
  })
})
