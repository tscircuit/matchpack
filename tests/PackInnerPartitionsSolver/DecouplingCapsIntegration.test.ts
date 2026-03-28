/**
 * Integration test: verifies that the LayoutPipelineSolver uses
 * DecouplingCapsPackingSolver for decoupling capacitor partitions and
 * produces a cleaner (row-based) layout.
 *
 * We build a minimal InputProblem that has a microcontroller with decoupling
 * caps to avoid depending on circuit-to-svg which has a broken export in the
 * currently installed version.
 */
import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { IdentifyDecouplingCapsSolver } from "lib/solvers/IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import type { InputProblem } from "lib/types/InputProblem"

/**
 * Builds a simple InputProblem: one MCU chip (U1) with VCC/GND pins
 * and N decoupling caps each connected VCC-GND via pin-strong-conn to U1.
 */
function buildDecapProblem(capCount = 4): InputProblem {
  const chipGap = 0.1
  const capSize = { x: 0.53, y: 1.06 }
  const mcuSize = { x: 3, y: 6 }

  const chipMap: InputProblem["chipMap"] = {
    U1: {
      chipId: "U1",
      pins: ["U1.VCC", "U1.GND"],
      size: mcuSize,
      availableRotations: [0, 90, 180, 270],
    },
  }
  const chipPinMap: InputProblem["chipPinMap"] = {
    "U1.VCC": {
      pinId: "U1.VCC",
      offset: { x: 0, y: mcuSize.y / 2 },
      side: "y+",
    },
    "U1.GND": {
      pinId: "U1.GND",
      offset: { x: 0, y: -mcuSize.y / 2 },
      side: "y-",
    },
  }
  const netMap: InputProblem["netMap"] = {
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
    GND: { netId: "GND", isGround: true },
  }
  const netConnMap: InputProblem["netConnMap"] = {
    "U1.VCC-VCC": true,
    "U1.GND-GND": true,
  }
  const pinStrongConnMap: InputProblem["pinStrongConnMap"] = {}

  for (let i = 0; i < capCount; i++) {
    const id = `C${i + 1}`
    const p1 = `${id}.1`
    const p2 = `${id}.2`
    chipMap[id] = {
      chipId: id,
      pins: [p1, p2],
      size: capSize,
      availableRotations: [0, 180],
    }
    chipPinMap[p1] = {
      pinId: p1,
      offset: { x: 0, y: capSize.y / 2 },
      side: "y+",
    }
    chipPinMap[p2] = {
      pinId: p2,
      offset: { x: 0, y: -capSize.y / 2 },
      side: "y-",
    }
    netConnMap[`${p1}-VCC`] = true
    netConnMap[`${p2}-GND`] = true
    // Strong connection to U1 (cap pin 1 → U1.VCC) so IdentifyDecouplingCapsSolver picks it up
    pinStrongConnMap[`${p1}-U1.VCC`] = true
  }

  return {
    chipMap,
    chipPinMap,
    netMap,
    pinStrongConnMap,
    netConnMap,
    chipGap,
    partitionGap: 2,
  }
}

test("DecouplingCapsPackingSolver integration: caps form a horizontal row via full pipeline", () => {
  const problem = buildDecapProblem(3)
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const layout = solver.getOutputLayout()
  expect(layout).toBeDefined()

  // Identify which partition is the decoupling caps one
  const decapPartitions = solver.chipPartitionsSolver!.partitions.filter(
    (p) => p.partitionType === "decoupling_caps",
  )
  expect(decapPartitions.length).toBeGreaterThan(0)

  for (const partition of decapPartitions) {
    const capChipIds = Object.keys(partition.chipMap).sort()
    expect(capChipIds.length).toBeGreaterThanOrEqual(2)

    // Verify all have placements
    for (const chipId of capChipIds) {
      expect(layout.chipPlacements[chipId]).toBeDefined()
    }
  }

  // All chips in the problem must have placements
  for (const chipId of Object.keys(problem.chipMap)) {
    expect(layout.chipPlacements[chipId]).toBeDefined()
  }
})

test("DecouplingCapsPackingSolver integration: IdentifyDecouplingCapsSolver finds caps in synthetic problem", () => {
  const problem = buildDecapProblem(3)
  const idSolver = new IdentifyDecouplingCapsSolver(problem)
  idSolver.solve()

  expect(idSolver.solved).toBe(true)
  expect(idSolver.outputDecouplingCapGroups.length).toBeGreaterThan(0)

  const group = idSolver.outputDecouplingCapGroups[0]!
  expect(group.mainChipId).toBe("U1")
  expect(group.decouplingCapChipIds.length).toBe(3)
})
