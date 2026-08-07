import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import type { InputProblem } from "lib/types/InputProblem"
import { problem as example06Problem } from "../../pages/LayoutPipelineSolver/LayoutPipelineSolver06.page"
import { problem as example07Problem } from "../../pages/LayoutPipelineSolver/LayoutPipelineSolver07.page"
import { getExampleCircuitJson as getExampleCircuitJson01 } from "../assets/ExampleCircuit01"
import { getExampleCircuitJson as getExampleCircuitJson02 } from "../assets/ExampleCircuit02"
import { getExampleCircuitJson as getExampleCircuitJson03 } from "../assets/ExampleCircuit03"
import { getExampleCircuitJson as getExampleCircuitJson04 } from "../assets/ExampleCircuit04"
import { getExampleCircuitJson as getRP2040CircuitJson } from "../assets/RP2040Circuit"

const fromCircuitJson = (
  circuitJson: ReturnType<typeof getExampleCircuitJson01>,
) =>
  getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

const withCapacitorRotations = (
  problem: InputProblem,
  availableRotations: Array<0 | 90 | 180 | 270>,
) => {
  for (const [chipId, chip] of Object.entries(problem.chipMap)) {
    if (/^C\d+$/.test(chipId) || chipId.toLowerCase().includes("capacitor")) {
      chip.availableRotations = availableRotations
    }
  }
  return problem
}

const examples: Array<{
  name: string
  getProblem: () => InputProblem
  svgWidth?: number
  svgHeight?: number
}> = [
  {
    name: "01",
    getProblem: () => fromCircuitJson(getExampleCircuitJson01()),
  },
  {
    name: "02",
    getProblem: () => fromCircuitJson(getExampleCircuitJson02()),
  },
  {
    name: "03",
    getProblem: () => fromCircuitJson(getExampleCircuitJson03()),
  },
  {
    name: "04",
    getProblem: () => fromCircuitJson(getExampleCircuitJson04()),
  },
  {
    name: "05",
    getProblem: () =>
      withCapacitorRotations(
        fromCircuitJson(getExampleCircuitJson03()),
        [0, 180],
      ),
  },
  {
    name: "06",
    getProblem: () => structuredClone(example06Problem),
    svgWidth: 900,
    svgHeight: 620,
  },
  {
    name: "07",
    getProblem: () => structuredClone(example07Problem),
  },
  {
    name: "rp2040",
    getProblem: () =>
      withCapacitorRotations(fromCircuitJson(getRP2040CircuitJson()), [0]),
    svgWidth: 900,
    svgHeight: 620,
  },
]

for (const { name, getProblem, svgWidth, svgHeight } of examples) {
  test(`LayoutPipelineSolver example ${name} visual snapshot`, async () => {
    const solver = new LayoutPipelineSolver(getProblem())

    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
    await expect(solver).toMatchSolverSnapshot(import.meta.path, {
      svgName: `layout-pipeline-example-${name}`,
      svgWidth,
      svgHeight,
    })
  })
}
