import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import type { InputProblem } from "lib/types/InputProblem"
import { normalizeSide } from "lib/types/Side"

export default function LayoutPipelineSolver01Page() {
  // Test data from LayoutPipelineSolver.test.ts
  const problem: InputProblem = {
    chipMap: {
      C1: { chipId: "C1", pins: ["P1", "P2"] },
    },
    chipPinMap: {
      P1: { pinId: "P1", offset: { x: 0, y: 0 }, side: normalizeSide("left") },
      P2: {
        pinId: "P2",
        offset: { x: 10, y: 10 },
        side: normalizeSide("right"),
      },
    },
    groupMap: {
      G1: {
        groupId: "G1",
        pins: ["P3"],
        shape: [{ x: 20, y: 20, width: 10, height: 10 } as any],
      },
    },
    groupPinMap: {
      P3: { pinId: "P3", offset: { x: 25, y: 25 } },
    },
    netMap: {
      N1: { netId: "N1" },
    },
    pinConnMap: {},
    netConnMap: {
      "P1-N1": true,
      "P3-N1": true,
    },
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">
        Layout Pipeline Solver - Test Case 01
      </h1>
      <p className="mb-4 text-gray-600">
        This page demonstrates the LayoutPipelineSolver with a simple test case
        containing:
      </p>
      <ul className="mb-6 list-disc list-inside text-gray-600">
        <li>1 chip (C1) with 2 pins (P1, P2)</li>
        <li>1 group (G1) with 1 pin (P3)</li>
        <li>1 net (N1) connecting P1 and P3</li>
      </ul>

      <LayoutPipelineDebugger problem={problem} />
    </div>
  )
}
