import { describe, it, expect } from "bun:test"
import { createFilteredNetworkMapping } from "../lib/utils/networkFiltering"
import type { InputProblem } from "../lib/types/InputProblem"

describe("createFilteredNetworkMapping", () => {
  it("prefers direct connections over net connections", () => {
    const inputProblem: InputProblem = {
      chipMap: {
        A: { chipId: "A", pins: ["A.p1"], size: { x: 1, y: 1 } },
        B: { chipId: "B", pins: ["B.p1"], size: { x: 1, y: 1 } },
      },
      chipPinMap: {
        "A.p1": { pinId: "A.p1", offset: { x: 0, y: 0 }, side: "x+" },
        "B.p1": { pinId: "B.p1", offset: { x: 0, y: 0 }, side: "x-" },
      },
      netMap: { N1: { netId: "N1" } },
      pinStrongConnMap: { "A.p1-B.p1": true },
      netConnMap: { "A.p1-N1": true, "B.p1-N1": true },
      chipGap: 0,
      partitionGap: 0,
    }

    const { pinToNetworkMap } = createFilteredNetworkMapping(inputProblem)
    expect(pinToNetworkMap.get("A.p1")).toBe("A.p1-B.p1")
    expect(pinToNetworkMap.get("B.p1")).toBe("A.p1-B.p1")
  })
})
