/**
 * Integration tests for applyDecouplingLayout / buildDecapMap.
 *
 * Key scenarios:
 *  - Decap is placed at the IC power-pin's actual position, not (0,0).
 *  - Works for AGND, DGND, PGND nets (regression for review comment).
 */

import { describe, it, expect } from "vitest"
import { applyDecouplingLayout, buildDecapMap } from "./apply-decoupling-layout"
import type { SoupElements } from "./apply-decoupling-layout"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSoup(
  icPinSide: "top" | "bottom" | "left" | "right",
  icPinPos: { x: number; y: number },
  netName: string,
): SoupElements {
  return {
    source_components: [
      {
        source_component_id: "IC1",
        name: "U1",
        ftype: "chip",
      },
      {
        source_component_id: "C1",
        name: "C1",
        ftype: "capacitor",
      },
    ],
    source_ports: [
      // IC power pin
      {
        source_port_id: "P_IC1_VDD",
        source_component_id: "IC1",
        name: "VDD",
        pin_number: 4,
        position: icPinPos,
        side: icPinSide,
      },
      // Capacitor pin 1 (connects to the same power net)
      {
        source_port_id: "P_C1_1",
        source_component_id: "C1",
        name: "1",
        pin_number: 1,
      },
      // Capacitor pin 2 (GND side — also a power net, but not the one we're testing)
      {
        source_port_id: "P_C1_2",
        source_component_id: "C1",
        name: "2",
        pin_number: 2,
      },
    ],
    source_nets: [
      { source_net_id: "NET_PWR", name: netName },
      { source_net_id: "NET_GND", name: "GND" },
    ],
    source_traces: [
      // IC power pin + cap pin 1 share the power net
      {
        source_trace_id: "T1",
        connected_source_net_id: "NET_PWR",
        connected_source_port_ids: ["P_IC1_VDD", "P_C1_1"],
      },
      // Cap pin 2 connects to GND
      {
        source_trace_id: "T2",
        connected_source_net_id: "NET_GND",
        connected_source_port_ids: ["P_C1_2"],
      },
    ],
    pcb_components: [
      {
        pcb_component_id: "PCB_C1",
        source_component_id: "C1",
        x: 0,
        y: 0,
        rotation: 0,
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// buildDecapMap — position resolution
// ---------------------------------------------------------------------------

describe("buildDecapMap", () => {
  it("resolves the IC pin position/side rather than using (0,0)/top as placeholder", () => {
    const soup = makeSoup("right", { x: 10, y: 5 }, "VDD")
    const map = buildDecapMap(soup)

    expect(map.has("C1")).toBe(true)
    const pinInfo = map.get("C1")!
    expect(pinInfo.position).toEqual({ x: 10, y: 5 })
    expect(pinInfo.side).toBe("right")
    expect(pinInfo.net).toBe("VDD")
  })

  it("works for AGND net (regression: was not matched by old patterns)", () => {
    const soup = makeSoup("bottom", { x: 3, y: -7 }, "AGND")
    const map = buildDecapMap(soup)

    expect(map.has("C1")).toBe(true)
    const pinInfo = map.get("C1")!
    expect(pinInfo.net).toBe("AGND")
    expect(pinInfo.position).toEqual({ x: 3, y: -7 })
    expect(pinInfo.side).toBe("bottom")
  })

  it("works for DGND net", () => {
    const soup = makeSoup("top", { x: -2, y: 8 }, "DGND")
    const map = buildDecapMap(soup)

    expect(map.get("C1")?.net).toBe("DGND")
    expect(map.get("C1")?.position).toEqual({ x: -2, y: 8 })
  })

  it("works for PGND net", () => {
    const soup = makeSoup("left", { x: -5, y: 0 }, "PGND")
    const map = buildDecapMap(soup)

    expect(map.get("C1")?.net).toBe("PGND")
    expect(map.get("C1")?.side).toBe("left")
  })

  it("falls back to (0,0)/top when no IC port is found on the power net", () => {
    // A soup with no IC component — cap is on VDD but no IC pin provides position.
    const soup: SoupElements = {
      source_components: [
        { source_component_id: "C2", name: "C2", ftype: "capacitor" },
      ],
      source_ports: [
        { source_port_id: "P_C2_1", source_component_id: "C2", name: "1" },
      ],
      source_nets: [{ source_net_id: "NET_VDD", name: "VDD" }],
      source_traces: [
        {
          source_trace_id: "T1",
          connected_source_net_id: "NET_VDD",
          connected_source_port_ids: ["P_C2_1"],
        },
      ],
      pcb_components: [],
    }

    const map = buildDecapMap(soup)
    const info = map.get("C2")
    expect(info).toBeDefined()
    expect(info?.position).toEqual({ x: 0, y: 0 })
    expect(info?.side).toBe("top")
  })
})

// ---------------------------------------------------------------------------
// applyDecouplingLayout — end-to-end
// ---------------------------------------------------------------------------

describe("applyDecouplingLayout", () => {
  it("places the decap outward from the real IC pin, not from the origin", () => {
    const soup = makeSoup("top", { x: 4, y: 6 }, "VDD")
    const placements = applyDecouplingLayout(soup, { clearance: 0.5 })

    expect(placements).toHaveLength(1)
    const [p] = placements

    // Should be 0.5 mm outward (positive Y) from the IC pin at (4, 6).
    expect(p.position.x).toBeCloseTo(4)
    expect(p.position.y).toBeCloseTo(6.5)
    expect(p.rotation).toBe(90)
  })

  it("updates pcb_component position in-place", () => {
    const soup = makeSoup("right", { x: 10, y: 2 }, "VCC")
    applyDecouplingLayout(soup, { clearance: 1.0 })

    const pcb = soup.pcb_components!.find((c) => c.source_component_id === "C1")!
    expect(pcb.x).toBeCloseTo(11)
    expect(pcb.y).toBeCloseTo(2)
    expect(pcb.rotation).toBe(0)
  })

  it("handles AGND decap end-to-end", () => {
    const soup = makeSoup("bottom", { x: 0, y: -5 }, "AGND")
    const [p] = applyDecouplingLayout(soup, { clearance: 0.5 })

    expect(p.net).toBe("AGND")
    expect(p.position.x).toBeCloseTo(0)
    expect(p.position.y).toBeCloseTo(-5.5)
  })
})
