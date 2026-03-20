import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { IdentifyDecouplingCapsSolver } from "lib/solvers/IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import { ChipPartitionsSolver } from "lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { getExampleCircuitJson } from "../assets/RP2040Circuit"
import fs from "fs"
import path from "path"

test("DecouplingCapLayout01 - RP2040 decoupling caps identified and grouped", () => {
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  const solver = new IdentifyDecouplingCapsSolver(problem)
  solver.solve()
  expect(solver.solved).toBe(true)

  // Should identify two decoupling cap groups
  expect(solver.outputDecouplingCapGroups.length).toBe(2)

  // IOVDD group: C12, C14, C8, C13, C15, C19 — connected via V3_3/GND
  const iovddGroup = solver.outputDecouplingCapGroups.find(
    (g) => g.netPair.includes("V3_3") && g.netPair.includes("GND"),
  )
  expect(iovddGroup).toBeDefined()
  expect(iovddGroup!.mainChipId).toBe("U3")
  expect(iovddGroup!.decouplingCapChipIds.length).toBe(6)

  // DVDD group: C18, C7 — connected via V1_1/GND
  const dvddGroup = solver.outputDecouplingCapGroups.find(
    (g) => g.netPair.includes("V1_1") && g.netPair.includes("GND"),
  )
  expect(dvddGroup).toBeDefined()
  expect(dvddGroup!.mainChipId).toBe("U3")
  expect(dvddGroup!.decouplingCapChipIds.length).toBe(2)
})

test("DecouplingCapLayout01 - decoupling cap partitions created with correct type", () => {
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  const decapSolver = new IdentifyDecouplingCapsSolver(problem)
  decapSolver.solve()

  const partSolver = new ChipPartitionsSolver({
    inputProblem: problem,
    decouplingCapGroups: decapSolver.outputDecouplingCapGroups,
  })
  partSolver.solve()
  expect(partSolver.solved).toBe(true)

  // Should have decoupling_caps partitions
  const decapPartitions = partSolver.partitions.filter(
    (p) => (p as any).partitionType === "decoupling_caps",
  )
  expect(decapPartitions.length).toBe(2)

  // IOVDD partition should have 6 caps
  const iovddPartition = decapPartitions.find(
    (p) => Object.keys(p.chipMap).length === 6,
  )
  expect(iovddPartition).toBeDefined()

  // DVDD partition should have 2 caps
  const dvddPartition = decapPartitions.find(
    (p) => Object.keys(p.chipMap).length === 2,
  )
  expect(dvddPartition).toBeDefined()
})

test("DecouplingCapLayout01 - decoupling caps laid out in clean horizontal rows without overlaps", () => {
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const layout = solver.getOutputLayout()
  expect(layout).toBeDefined()

  // All chips should have placements
  const chipIds = Object.keys(problem.chipMap)
  for (const chipId of chipIds) {
    expect(layout.chipPlacements[chipId]).toBeDefined()
  }

  // IOVDD decoupling caps should be in a horizontal row (same Y coordinate)
  const iovddCaps = ["C8", "C12", "C13", "C14", "C15", "C19"]
  const iovddYs = iovddCaps.map((id) => layout.chipPlacements[id]!.y)
  const uniqueIovddYs = new Set(iovddYs.map((y) => y.toFixed(3)))
  expect(uniqueIovddYs.size).toBe(1) // All same Y = horizontal row

  // DVDD decoupling caps should be in a horizontal row
  const dvddCaps = ["C7", "C18"]
  const dvddYs = dvddCaps.map((id) => layout.chipPlacements[id]!.y)
  const uniqueDvddYs = new Set(dvddYs.map((y) => y.toFixed(3)))
  expect(uniqueDvddYs.size).toBe(1) // All same Y = horizontal row

  // No overlaps in the final layout
  const overlaps = solver.checkForOverlaps(layout)
  expect(overlaps.length).toBe(0)

  // Generate SVG snapshot for visual verification
  const viz = solver.visualize()
  const svg = getSvgFromGraphicsObject(viz)
  expect(svg).toBeDefined()
  expect(svg.length).toBeGreaterThan(0)

  // Write SVG to test output directory for visual inspection
  const snapshotDir = path.join(import.meta.dir, "__snapshots__")
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true })
  }
  fs.writeFileSync(
    path.join(snapshotDir, "DecouplingCapLayout01_final.svg"),
    svg,
  )
})
