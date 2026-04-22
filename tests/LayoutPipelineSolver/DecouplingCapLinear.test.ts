import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { normalizeSide } from "lib/types/Side"

test("Decoupling capacitors should be laid out in a row", () => {
  const problem: InputProblem = {
    chipMap: {
      U1: { chipId: "U1", pins: ["U1.1", "U1.2", "U1.3", "U1.4", "U1.5", "U1.6"], size: { x: 20, y: 20 } },
    },
    chipPinMap: {
      "U1.1": { pinId: "U1.1", offset: { x: -10, y: -10 }, side: normalizeSide("left") },
      "U1.2": { pinId: "U1.2", offset: { x: -10, y: 0 }, side: normalizeSide("left") },
      "U1.3": { pinId: "U1.3", offset: { x: -10, y: 10 }, side: normalizeSide("left") },
      "U1.4": { pinId: "U1.4", offset: { x: 10, y: -10 }, side: normalizeSide("right") },
      "U1.5": { pinId: "U1.5", offset: { x: 10, y: 0 }, side: normalizeSide("right") },
      "U1.6": { pinId: "U1.6", offset: { x: 10, y: 10 }, side: normalizeSide("right") },
    },
    netMap: {
      GND: { netId: "GND", isGround: true },
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "U1.1-VCC": true,
    },
    chipGap: 1,
    partitionGap: 2,
    decouplingCapsGap: 0.5,
  }

  // Add 10 capacitors with different sizes
  for (let i = 1; i <= 10; i++) {
    const chipId = `C${i}`
    const width = i % 2 === 0 ? 1 : 2
    const height = i % 2 === 0 ? 2 : 1
    problem.chipMap[chipId] = { chipId, pins: [`${chipId}.1`, `${chipId}.2`], size: { x: width, y: height }, availableRotations: [0, 90, 180, 270] }
    problem.chipPinMap[`${chipId}.1`] = { pinId: `${chipId}.1`, offset: { x: -width/2, y: 0 }, side: normalizeSide("left") }
    problem.chipPinMap[`${chipId}.2`] = { pinId: `${chipId}.2`, offset: { x: width/2, y: 0 }, side: normalizeSide("right") }
    problem.pinStrongConnMap[`${chipId}.1-U1.1`] = true
    problem.netConnMap[`${chipId}.1-VCC`] = true
    problem.netConnMap[`${chipId}.2-GND`] = true
  }

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  const layout = solver.getOutputLayout()
  
  const yCoords = new Set()
  for (let i = 1; i <= 10; i++) {
    const p = layout.chipPlacements[`C${i}`]!
    yCoords.add(p.y.toFixed(2))
  }

  expect(yCoords.size).toBe(1)
})
