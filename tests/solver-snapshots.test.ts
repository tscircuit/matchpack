import { expect, test } from "bun:test"
import { ChipPartitionsSolver } from "lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import type { InputProblem } from "lib/types/InputProblem"
import { normalizeSide } from "lib/types/Side"
import { getExampleCircuitJson } from "./assets/ExampleCircuit02"

const getSmallInputProblem = (): InputProblem => ({
  chipMap: {
    U1: {
      chipId: "U1",
      pins: ["U1.A", "U1.B"],
      size: { x: 2, y: 2 },
    },
    C1: {
      chipId: "C1",
      pins: ["C1.A", "C1.B"],
      size: { x: 1, y: 0.5 },
    },
    R1: {
      chipId: "R1",
      pins: ["R1.A", "R1.B"],
      size: { x: 1.2, y: 0.4 },
    },
  },
  chipPinMap: {
    "U1.A": {
      pinId: "U1.A",
      offset: { x: -1, y: 0 },
      side: normalizeSide("left"),
    },
    "U1.B": {
      pinId: "U1.B",
      offset: { x: 1, y: 0 },
      side: normalizeSide("right"),
    },
    "C1.A": {
      pinId: "C1.A",
      offset: { x: -0.5, y: 0 },
      side: normalizeSide("left"),
    },
    "C1.B": {
      pinId: "C1.B",
      offset: { x: 0.5, y: 0 },
      side: normalizeSide("right"),
    },
    "R1.A": {
      pinId: "R1.A",
      offset: { x: -0.6, y: 0 },
      side: normalizeSide("left"),
    },
    "R1.B": {
      pinId: "R1.B",
      offset: { x: 0.6, y: 0 },
      side: normalizeSide("right"),
    },
  },
  netMap: {
    GND: { netId: "GND" },
    VCC: { netId: "VCC" },
  },
  pinStrongConnMap: {
    "U1.B-C1.A": true,
    "C1.A-U1.B": true,
  },
  netConnMap: {
    "U1.A-GND": true,
    "C1.B-VCC": true,
    "R1.A-GND": true,
    "R1.B-VCC": true,
  },
  chipGap: 0.2,
  partitionGap: 2,
})

test("ChipPartitionsSolver SVG snapshot", async () => {
  const solver = new ChipPartitionsSolver({
    inputProblem: getSmallInputProblem(),
  })

  solver.solve()

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgName: "chip-partitions",
    svgWidth: 700,
    svgHeight: 420,
  })
})

test("LayoutPipelineSolver SVG snapshot for small input", async () => {
  const solver = new LayoutPipelineSolver(getSmallInputProblem())

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgName: "layout-pipeline-small",
    svgWidth: 700,
    svgHeight: 420,
  })
})

test("LayoutPipelineSolver SVG snapshot for ExampleCircuit02", async () => {
  const problem = getInputProblemFromCircuitJsonSchematic(
    getExampleCircuitJson(),
    {
      useReadableIds: true,
    },
  )
  const solver = new LayoutPipelineSolver(problem)

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgName: "layout-pipeline-example02",
    svgWidth: 900,
    svgHeight: 620,
  })
})
