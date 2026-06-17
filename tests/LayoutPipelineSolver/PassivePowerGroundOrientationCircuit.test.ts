import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import { getExampleCircuitJson } from "../assets/PassivePowerGroundOrientationCircuit"

test("passive power-ground orientation LayoutPipelineSolver SVG snapshot", async () => {
  const problem = getInputProblemFromCircuitJsonSchematic(
    getExampleCircuitJson(),
    { useReadableIds: true },
  )

  expect(problem.netMap["VSYS"]?.isPositiveVoltageSource).toBe(true)
  expect(problem.netMap["GND"]?.isGround).toBe(true)
  expect(problem.netConnMap["R_PULLUP.1-VSYS"]).toBe(true)
  expect(problem.netConnMap["R_PULLDOWN.2-GND"]).toBe(true)
  expect(problem.netConnMap["C_DECOUPLE.1-VSYS"]).toBe(true)
  expect(problem.netConnMap["C_DECOUPLE.2-GND"]).toBe(true)
  expect(problem.netConnMap["D_POWER.1-VSYS"]).toBe(true)
  expect(problem.netConnMap["D_POWER.2-GND"]).toBe(true)
  expect(problem.netConnMap["LED_POWER.1-VSYS"]).toBe(true)
  expect(problem.netConnMap["LED_POWER.2-GND"]).toBe(true)

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.inputProblem.chipMap["R_PULLUP"]?.availableRotations).toEqual([
    0,
  ])
  expect(solver.inputProblem.chipMap["R_PULLDOWN"]?.availableRotations).toEqual(
    [90],
  )
  expect(solver.inputProblem.chipMap["C_DECOUPLE"]?.availableRotations).toEqual(
    [270],
  )
  expect(solver.inputProblem.chipMap["D_POWER"]?.availableRotations).toEqual([
    270,
  ])
  expect(solver.inputProblem.chipMap["LED_POWER"]?.availableRotations).toEqual([
    270,
  ])

  const outputLayout = solver.getOutputLayout()
  expect(outputLayout.chipPlacements["R_PULLUP"]?.ccwRotationDegrees).toBe(0)
  expect(outputLayout.chipPlacements["R_PULLDOWN"]?.ccwRotationDegrees).toBe(90)
  expect(outputLayout.chipPlacements["C_DECOUPLE"]?.ccwRotationDegrees).toBe(
    270,
  )
  expect(outputLayout.chipPlacements["D_POWER"]?.ccwRotationDegrees).toBe(270)
  expect(outputLayout.chipPlacements["LED_POWER"]?.ccwRotationDegrees).toBe(270)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgName: "passive-power-ground-orientation",
    svgWidth: 900,
    svgHeight: 700,
  })
})
