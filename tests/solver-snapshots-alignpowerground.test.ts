import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { normalizeSide } from "lib/types/Side"

const createExample40PowerGroundProblem = (): InputProblem => {
  const resistorIds = ["R1", "R2", "R3", "R4", "R5", "R6"] as const
  const resistorNetPairs: Record<
    (typeof resistorIds)[number],
    [string, string]
  > = {
    R1: ["VCC", "GND"],
    R2: ["VDD", "AGND"],
    R3: ["V3V3", "DGND"],
    R4: ["VBUS", "VSS"],
    R5: ["V3V", "DGND"],
    R6: ["V3_3", "GND"],
  }

  const problem: InputProblem = {
    chipMap: {},
    chipPinMap: {},
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      VDD: { netId: "VDD", isPositiveVoltageSource: true },
      V3V3: { netId: "V3V3", isPositiveVoltageSource: true },
      VBUS: { netId: "VBUS", isPositiveVoltageSource: true },
      V3V: { netId: "V3V", isPositiveVoltageSource: true },
      V3_3: { netId: "V3_3", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
      AGND: { netId: "AGND", isGround: true },
      DGND: { netId: "DGND", isGround: true },
      VSS: { netId: "VSS", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.6,
    partitionGap: 1.2,
  }

  for (const resistorId of resistorIds) {
    const pin1 = `${resistorId}.1`
    const pin2 = `${resistorId}.2`
    const [powerNetId, groundNetId] = resistorNetPairs[resistorId]

    problem.chipMap[resistorId] = {
      chipId: resistorId,
      pins: [pin1, pin2],
      size: { x: 1.1, y: 0.3889107 },
      availableRotations: [270],
    }
    problem.chipPinMap[pin1] = {
      pinId: pin1,
      offset: { x: -0.55, y: 0 },
      side: normalizeSide("left"),
    }
    problem.chipPinMap[pin2] = {
      pinId: pin2,
      offset: { x: 0.55, y: 0 },
      side: normalizeSide("right"),
    }
    problem.netConnMap[`${pin1}-${powerNetId}`] = true
    problem.netConnMap[`${pin2}-${groundNetId}`] = true
  }

  return problem
}

test("LayoutPipelineSolver SVG snapshot for example40-style power/ground labels", async () => {
  const problem = createExample40PowerGroundProblem()
  const solver = new LayoutPipelineSolver(problem)

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const layout = solver.getOutputLayout()
  const placements = Object.values(layout.chipPlacements)
  expect(placements).toHaveLength(6)

  const firstY = placements[0]!.y
  for (const placement of placements) {
    expect(placement.ccwRotationDegrees).toBe(270)
    expect(Math.abs(placement.y - firstY)).toBeLessThan(1e-6)
  }

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgName: "layout-pipeline-example40-power-ground-row",
    svgWidth: 900,
    svgHeight: 360,
  })
})
