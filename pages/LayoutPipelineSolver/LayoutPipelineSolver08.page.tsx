/**
 * Demo: PowerNetVerticalBiasSolver effect on schematic layout.
 *
 * This page demonstrates issue #12 ("bad layout") improvement.
 * A circuit with explicit VCC and GND nets is laid out — after the
 * PowerNetVerticalBiasSolver runs:
 *   - Components on VCC nets shift upward  (conventional "power at top")
 *   - Components on GND nets shift downward (conventional "ground at bottom")
 *
 * The result is a more conventional, readable schematic.
 */
import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import type { InputProblem } from "lib/index"

export const problem: InputProblem = {
  chipMap: {
    U1: {
      chipId: "U1",
      pins: ["U1.1", "U1.2", "U1.3", "U1.4"],
      size: { x: 2, y: 1.6 },
      availableRotations: [0, 90, 180, 270],
    },
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 0.53, y: 1.06 },
      availableRotations: [0],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 0.53, y: 1.06 },
      availableRotations: [0],
    },
    R1: {
      chipId: "R1",
      pins: ["R1.1", "R1.2"],
      size: { x: 0.53, y: 1.06 },
      availableRotations: [0],
    },
  },
  chipPinMap: {
    "U1.1": { pinId: "U1.1", offset: { x: -1, y: 0.4 }, side: "x-" },
    "U1.2": { pinId: "U1.2", offset: { x: -1, y: -0.4 }, side: "x-" },
    "U1.3": { pinId: "U1.3", offset: { x: 1, y: 0.4 }, side: "x+" },
    "U1.4": { pinId: "U1.4", offset: { x: 1, y: -0.4 }, side: "x+" },
    "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C2.1": { pinId: "C2.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C2.2": { pinId: "C2.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "R1.1": { pinId: "R1.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "R1.2": { pinId: "R1.2", offset: { x: 0, y: -0.55 }, side: "y-" },
  },
  netMap: {
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
    GND: { netId: "GND", isGround: true },
    SIG: { netId: "SIG" },
  },
  pinStrongConnMap: {
    "C1.1-U1.1": true,
    "U1.1-C1.1": true,
    "C2.2-U1.2": true,
    "U1.2-C2.2": true,
    "R1.1-U1.3": true,
    "U1.3-R1.1": true,
  },
  netConnMap: {
    "U1.1-VCC": true,
    "C1.1-VCC": true,
    "U1.2-GND": true,
    "C2.2-GND": true,
    "U1.3-SIG": true,
    "R1.1-SIG": true,
    "U1.4-GND": true,
    "C1.2-GND": true,
    "C2.1-VCC": true,
    "R1.2-GND": true,
  },
  chipGap: 0.5,
  decouplingCapsGap: 0.3,
  partitionGap: 1.2,
}

export default function LayoutPipelineSolver08Page() {
  return <LayoutPipelineDebugger problem={problem} />
}
