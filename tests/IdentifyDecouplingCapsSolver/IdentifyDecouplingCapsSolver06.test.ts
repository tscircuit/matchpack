import { test, expect } from "bun:test"
import { IdentifyDecouplingCapsSolver } from "../../lib/solvers/IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import type { InputProblem } from "../../lib/types/InputProblem"

const problem: InputProblem = {
  chipMap: {
    U1: {
      chipId: "U1",
      pins: ["U1.1", "U1.2"],
      size: { x: 2, y: 2 },
      availableRotations: [0, 90, 180, 270],
    },
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 0.5, y: 1 },
      availableRotations: [0],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 0.5, y: 1 },
      availableRotations: [0],
    },
  },
  chipPinMap: {
    "U1.1": { pinId: "U1.1", offset: { x: -1, y: 0.5 }, side: "x-" },
    "U1.2": { pinId: "U1.2", offset: { x: -1, y: -0.5 }, side: "x-" },
    "C1.1": { pinId: "C1.1", offset: { x: 0, y: 0.5 }, side: "y+" },
    "C1.2": { pinId: "C1.2", offset: { x: 0, y: -0.5 }, side: "y-" },
    "C2.1": { pinId: "C2.1", offset: { x: 0, y: 0.5 }, side: "y+" },
    "C2.2": { pinId: "C2.2", offset: { x: 0, y: -0.5 }, side: "y-" },
  },
  netMap: {
    GND: { netId: "GND", isGround: true },
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
  },
  pinStrongConnMap: {
    "U1.1-C1.1": true,
    "C1.1-U1.1": true,
    "U1.2-C2.1": true,
    "C2.1-U1.2": true,
  },
  netConnMap: {
    "U1.1-VCC": true,
    "U1.2-VCC": true,
    "C1.2-GND": true,
    "C2.2-GND": true,
  },
  chipGap: 0.2,
  partitionGap: 1,
}

test("IdentifyDecouplingCapsSolver identifies decoupling capacitor groups", () => {
  const solver = new IdentifyDecouplingCapsSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)

  console.log("Decoupling Cap Groups:")
  for (const group of solver.outputDecouplingCapGroups) {
    console.log(`  Group ID: ${group.decouplingCapGroupId}`)
    console.log(`  Main Chip: ${group.mainChipId}`)
    console.log(`  Net Pair: [${group.netPair.join(", ")}]`)
    console.log(
      `  Decoupling Capacitors: [${group.decouplingCapChipIds.join(", ")}]`,
    )
    console.log()
  }

  // Basic validation that the solver produced some groups
  expect(solver.outputDecouplingCapGroups.length).toBeGreaterThan(0)

  // Ensure all groups have valid structure
  for (const group of solver.outputDecouplingCapGroups) {
    expect(group.decouplingCapGroupId).toBeTruthy()
    expect(group.mainChipId).toBeTruthy()
    expect(group.netPair).toHaveLength(2)
    expect(group.decouplingCapChipIds.length).toBeGreaterThan(0)
  }
})
