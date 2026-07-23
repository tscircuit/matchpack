import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import input from "../assets/repro-32khz-crystal-load-caps.input.json"

test("32.768 kHz crystal with two grounded load capacitors", async () => {
  expect((input as InputProblem).chipMap.X1?.isCrystal).toBe(true)
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const crystalGroups =
    solver.identifyCrystalCircuitsSolver?.outputCrystalCircuitGroups
  expect(crystalGroups).toHaveLength(1)
  expect(crystalGroups?.[0]).toMatchObject({
    crystalChipId: "X1",
    activeCrystalPinIds: ["X1.1", "X1.2"],
    loadCaps: [
      { chipId: "C1", signalPinId: "C1.1", groundPinId: "C1.2" },
      { chipId: "C2", signalPinId: "C2.1", groundPinId: "C2.2" },
    ],
  })

  expect(solver.chipPartitions).toHaveLength(1)
  expect(solver.chipPartitions?.[0]?.partitionType).toBe("crystal_circuit")
  expect(Object.keys(solver.chipPartitions?.[0]?.chipMap ?? {}).sort()).toEqual(
    ["C1", "C2", "X1"],
  )
  expect(
    solver.packInnerPartitionsSolver?.completedSolvers[0]?.constructor.name,
  ).toBe("CrystalCircuitLayoutSolver")

  const layout = solver.getOutputLayout()
  const absolutePin = (chipId: "X1" | "C1" | "C2", pinId: string) => {
    const placement = layout.chipPlacements[chipId]!
    const pin = input.chipPinMap[pinId as keyof typeof input.chipPinMap]
    const offset = rotatePinOffset(pin!.offset, placement.ccwRotationDegrees)
    return { x: placement.x + offset.x, y: placement.y + offset.y }
  }

  expect(absolutePin("C1", "C1.1").x).toBeCloseTo(absolutePin("X1", "X1.1").x)
  expect(absolutePin("C2", "C2.1").x).toBeCloseTo(absolutePin("X1", "X1.2").x)
  expect(absolutePin("C1", "C1.2").y).toBeCloseTo(absolutePin("C2", "C2.2").y)
  expect(solver.checkForOverlaps(layout)).toEqual([])

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
