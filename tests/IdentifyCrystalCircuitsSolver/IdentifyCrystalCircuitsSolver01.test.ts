import { expect, test } from "bun:test"
import { IdentifyCrystalCircuitsSolver } from "../../lib/solvers/IdentifyCrystalCircuitsSolver/IdentifyCrystalCircuitsSolver"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import verticalRawInput from "../assets/repro-32khz-crystal-load-caps.input.json"
import rawInput from "../assets/rp2040-zero-board-crystal.input.json"

const buildInput = (): InputProblem => {
  return structuredClone(rawInput) as InputProblem
}

test("identifies a four-pin crystal, two grounded load caps, and series resistor", () => {
  const solver = new IdentifyCrystalCircuitsSolver(buildInput())
  solver.solve()

  expect(solver.outputCrystalCircuitGroups).toEqual([
    {
      crystalCircuitGroupId: "crystal_circuit_X1",
      crystalChipId: "X1",
      activeCrystalPinIds: ["X1.1", "X1.3"],
      loadCaps: [
        {
          chipId: "C16",
          signalPinId: "C16.1",
          groundPinId: "C16.2",
        },
        {
          chipId: "C17",
          signalPinId: "C17.1",
          groundPinId: "C17.2",
        },
      ],
      groundNetId:
        "unnamedsubcircuitsubcircuit_source_group_5_connectivity_net1",
      seriesResistors: [
        {
          chipId: "R8",
          crystalPinId: "X1.3",
          connectedPinId: "R8.2",
        },
      ],
    },
  ])
})

test("packs the complete crystal circuit as one deterministic partition", () => {
  const solver = new LayoutPipelineSolver(buildInput())
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.chipPartitions).toHaveLength(1)
  expect(solver.chipPartitions?.[0]?.partitionType).toBe("crystal_circuit")
  expect(Object.keys(solver.chipPartitions?.[0]?.chipMap ?? {}).sort()).toEqual(
    ["C16", "C17", "R8", "X1"],
  )
  expect(
    solver.packInnerPartitionsSolver?.completedSolvers[0]?.constructor.name,
  ).toBe("CrystalCircuitLayoutSolver")
  expect(solver.checkForOverlaps(solver.getOutputLayout())).toEqual([])
})

test("does not infer a crystal from reference designator or topology alone", () => {
  const input = buildInput()
  delete input.chipMap.X1!.isCrystal

  const solver = new IdentifyCrystalCircuitsSolver(input)
  solver.solve()

  expect(solver.outputCrystalCircuitGroups).toEqual([])
})

test("places load capacitors on opposite sides of a vertically locked crystal", () => {
  const input = structuredClone(verticalRawInput) as InputProblem
  input.chipMap.X1!.availableRotations = [90]

  const solver = new LayoutPipelineSolver(input)
  solver.solve()
  const layout = solver.getOutputLayout()

  expect(layout.chipPlacements.C1!.x).toBeLessThan(layout.chipPlacements.X1!.x)
  expect(layout.chipPlacements.C2!.x).toBeGreaterThan(
    layout.chipPlacements.X1!.x,
  )
  expect(solver.checkForOverlaps(layout)).toEqual([])
})

test("leaves a horizontal chip gap between load capacitors", () => {
  const input = structuredClone(verticalRawInput) as InputProblem
  const solver = new LayoutPipelineSolver(input)
  solver.solve()
  const layout = solver.getOutputLayout()
  const cap1 = layout.chipPlacements.C1!
  const cap2 = layout.chipPlacements.C2!
  const cap1Width = input.chipMap.C1!.size.y
  const cap2Width = input.chipMap.C2!.size.y
  const horizontalGap = cap2.x - cap2Width / 2 - (cap1.x + cap1Width / 2)

  expect(solver.checkForOverlaps(layout)).toEqual([])
})
