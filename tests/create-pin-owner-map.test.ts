import { expect, test } from "bun:test"
import type { InputProblem } from "../lib/types/InputProblem"
import { createPinOwnerMap } from "../lib/utils/create-pin-owner-map"

test("createPinOwnerMap indexes each pin by its owning chip", () => {
  const inputProblem: InputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.1", "U1.2"],
        size: { x: 2, y: 2 },
      },
      R1: {
        chipId: "R1",
        pins: ["R1.1", "R1.2"],
        size: { x: 1, y: 0.5 },
      },
    },
    chipPinMap: {
      "U1.1": { pinId: "U1.1", offset: { x: -1, y: 0 }, side: "x-" },
      "U1.2": { pinId: "U1.2", offset: { x: 1, y: 0 }, side: "x+" },
      "R1.1": { pinId: "R1.1", offset: { x: -0.5, y: 0 }, side: "x-" },
      "R1.2": { pinId: "R1.2", offset: { x: 0.5, y: 0 }, side: "x+" },
    },
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  }

  const pinOwnerMap = createPinOwnerMap(inputProblem)

  expect(pinOwnerMap.size).toBe(4)
  expect(pinOwnerMap.get("U1.1")?.chipId).toBe("U1")
  expect(pinOwnerMap.get("U1.2")?.chipId).toBe("U1")
  expect(pinOwnerMap.get("R1.1")?.chipId).toBe("R1")
  expect(pinOwnerMap.get("R1.2")?.chipId).toBe("R1")
})
