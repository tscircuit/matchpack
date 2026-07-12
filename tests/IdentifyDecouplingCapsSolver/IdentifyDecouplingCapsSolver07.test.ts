import { test, expect } from "bun:test"
import { IdentifyDecouplingCapsSolver } from "../../lib/solvers/IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import type { InputProblem } from "../../lib/types/InputProblem"

/**
 * A decoupling cap is identified by component type, not geometry. CAP1 and DIODE1
 * are geometrically identical -- both 2-pin, pins on opposite y sides, both bridging
 * the same VCC/GND rail, both strongly connected to U1. Only CAP1 is a capacitor.
 * DIODE1 (think TVS diode or voltmeter) must not be grouped.
 */
const buildProblem = (): InputProblem => {
  const twoPinPart = (chipId: string, isCapacitor: boolean) => ({
    chip: {
      chipId,
      pins: [`${chipId}.1`, `${chipId}.2`],
      size: { x: 0.5, y: 1 },
      isCapacitor,
      availableRotations: [0, 180] as Array<0 | 180>,
    },
    pins: {
      [`${chipId}.1`]: {
        pinId: `${chipId}.1`,
        offset: { x: 0, y: 0.3 },
        side: "y+" as const,
      },
      [`${chipId}.2`]: {
        pinId: `${chipId}.2`,
        offset: { x: 0, y: -0.3 },
        side: "y-" as const,
      },
    },
  })

  const cap1 = twoPinPart("CAP1", true)
  const cap2 = twoPinPart("CAP2", true)
  const diode1 = twoPinPart("DIODE1", false)

  return {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.1", "U1.2", "U1.3"],
        size: { x: 2, y: 2 },
        availableRotations: [0],
      },
      CAP1: cap1.chip,
      CAP2: cap2.chip,
      DIODE1: diode1.chip,
    },
    chipPinMap: {
      "U1.1": { pinId: "U1.1", offset: { x: -1, y: 0.5 }, side: "x-" },
      "U1.2": { pinId: "U1.2", offset: { x: -1, y: 0 }, side: "x-" },
      "U1.3": { pinId: "U1.3", offset: { x: -1, y: -0.5 }, side: "x-" },
      ...cap1.pins,
      ...cap2.pins,
      ...diode1.pins,
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    // Each part's top pin is directly connected to a U1 pin (so U1 is the main chip).
    pinStrongConnMap: {
      "CAP1.1-U1.1": true,
      "U1.1-CAP1.1": true,
      "CAP2.1-U1.2": true,
      "U1.2-CAP2.1": true,
      "DIODE1.1-U1.3": true,
      "U1.3-DIODE1.1": true,
    },
    netConnMap: {
      "CAP1.1-VCC": true,
      "CAP1.2-GND": true,
      "CAP2.1-VCC": true,
      "CAP2.2-GND": true,
      "DIODE1.1-VCC": true,
      "DIODE1.2-GND": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
  }
}

test("IdentifyDecouplingCapsSolver groups only capacitors, not other 2-pin parts", () => {
  const solver = new IdentifyDecouplingCapsSolver(buildProblem())
  solver.solve()

  const grouped = solver.outputDecouplingCapGroups.flatMap(
    (group) => group.decouplingCapChipIds,
  )

  expect(new Set(grouped)).toEqual(new Set(["CAP1", "CAP2"]))
  expect(grouped).not.toContain("DIODE1")
})
