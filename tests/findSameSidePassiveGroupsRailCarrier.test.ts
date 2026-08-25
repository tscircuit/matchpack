import { expect, test } from "bun:test"
import type { InputProblem } from "../lib/types/InputProblem"
import { findSameSidePassiveGroups } from "../lib/solvers/PackInnerPartitionsSolver/findSameSidePassiveGroups"

test("groups two resistors that terminate on distinct pins of one 3-pin carrier", () => {
  const problem: InputProblem = {
    chipMap: {
      U1: {
        chipId: "U1",
        pins: ["U1.1", "U1.2", "U1.3", "U1.4"],
        size: { x: 1.2, y: 0.8 },
        availableRotations: [0],
      },
      R1: {
        chipId: "R1",
        pins: ["R1.1", "R1.2"],
        size: { x: 0.5, y: 1 },
        isResistor: true,
      },
      R2: {
        chipId: "R2",
        pins: ["R2.1", "R2.2"],
        size: { x: 0.5, y: 1 },
        isResistor: true,
      },
      SJ1: {
        chipId: "SJ1",
        pins: ["SJ1.1", "SJ1.2", "SJ1.3"],
        size: { x: 0.6, y: 0.6 },
      },
    },
    chipPinMap: {
      "U1.1": { pinId: "U1.1", side: "x-", offset: { x: -1, y: 0.2 } },
      "U1.2": { pinId: "U1.2", side: "x-", offset: { x: -1, y: 0 } },
      "U1.3": { pinId: "U1.3", side: "x+", offset: { x: 1, y: -0.2 } },
      "U1.4": { pinId: "U1.4", side: "x+", offset: { x: 1, y: 0.2 } },
      "R1.1": { pinId: "R1.1", side: "y+", offset: { x: 0, y: 0.5 } },
      "R1.2": { pinId: "R1.2", side: "y-", offset: { x: 0, y: -0.5 } },
      "R2.1": { pinId: "R2.1", side: "y+", offset: { x: 0, y: 0.5 } },
      "R2.2": { pinId: "R2.2", side: "y-", offset: { x: 0, y: -0.5 } },
      "SJ1.1": { pinId: "SJ1.1", side: "x-", offset: { x: -0.3, y: 0 } },
      "SJ1.2": { pinId: "SJ1.2", side: "y+", offset: { x: 0, y: 0.3 } },
      "SJ1.3": { pinId: "SJ1.3", side: "x+", offset: { x: 0.3, y: 0 } },
    },
    netMap: { V3_3: { netId: "V3_3", isPositiveVoltageSource: true } },
    pinStrongConnMap: {
      "R1.1-U1.4": true,
      "R2.1-U1.3": true,
      "SJ1.3-R1.2": true,
      "SJ1.1-R2.2": true,
    },
    netConnMap: { "SJ1.2-V3_3": true },
    chipGap: 0.4,
    partitionGap: 1.2,
  }

  expect(findSameSidePassiveGroups(problem)).toEqual([
    {
      mainChipId: "U1",
      side: "x+",
      passiveChipIds: ["R2", "R1"],
      mainChipPinIds: ["U1.3", "U1.4"],
    },
  ])
})
