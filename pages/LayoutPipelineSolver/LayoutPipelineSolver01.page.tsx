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

  return <LayoutPipelineDebugger problem={problem} />
}
