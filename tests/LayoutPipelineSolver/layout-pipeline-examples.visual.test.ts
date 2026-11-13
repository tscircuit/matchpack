import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import type { InputProblem } from "lib/types/InputProblem"
import example01InputProblem from "../../pages/examples/example01/inputProblem.json"
import example02InputProblem from "../../pages/examples/example02/inputProblem.json"
import { problem as layoutPipelineSolver06Problem } from "../../pages/LayoutPipelineSolver/LayoutPipelineSolver06.page"
import { problem as layoutPipelineSolver07Problem } from "../../pages/LayoutPipelineSolver/LayoutPipelineSolver07.page"
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
): InputProblem => {
  for (const [chipId, chip] of Object.entries(problem.chipMap)) {
    if (/^C\d+$/.test(chipId) || chipId.toLowerCase().includes("capacitor")) {
      chip.availableRotations = availableRotations
    }
  }
  return problem
}

const pipelineExamples: Array<{
  name: string
  getProblem: () => InputProblem
  svgWidth?: number
  svgHeight?: number
}> = [
  {
    name: "layout-pipeline-01",
    getProblem: () => fromCircuitJson(getExampleCircuitJson01()),
  },
  {
    name: "layout-pipeline-02",
    getProblem: () => fromCircuitJson(getExampleCircuitJson02()),
  },
  {
    name: "layout-pipeline-03",
    getProblem: () => fromCircuitJson(getExampleCircuitJson03()),
  },
  {
    name: "layout-pipeline-04",
    getProblem: () => fromCircuitJson(getExampleCircuitJson04()),
  },
  {
    name: "layout-pipeline-05",
    getProblem: () =>
      withCapacitorRotations(
        fromCircuitJson(getExampleCircuitJson03()),
        [0, 180],
      ),
  },
  {
    name: "layout-pipeline-06",
    getProblem: () => structuredClone(layoutPipelineSolver06Problem),
    svgWidth: 900,
    svgHeight: 620,
  },
  {
    name: "layout-pipeline-07",
    getProblem: () => structuredClone(layoutPipelineSolver07Problem),
  },
  {
    name: "layout-pipeline-rp2040",
    getProblem: () =>
      withCapacitorRotations(fromCircuitJson(getRP2040CircuitJson()), [0]),
    svgWidth: 900,
    svgHeight: 620,
  },
  {
    name: "example-01",
    getProblem: () => structuredClone(example01InputProblem as InputProblem),
  },
  {
    name: "example-02",
    getProblem: () => structuredClone(example02InputProblem as InputProblem),
  },
]

for (const { name, getProblem, svgWidth, svgHeight } of pipelineExamples) {
  test(`LayoutPipelineSolver visual snapshot: ${name}`, async () => {
    const problem = getProblem()
    const solver = new LayoutPipelineSolver(problem)

    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)

    const outputLayout = solver.getOutputLayout()
    expect(solver.checkForOverlaps(outputLayout)).toHaveLength(0)

    await expect(solver).toMatchSolverSnapshot(import.meta.path, {
      svgName: name,
      svgWidth,
      svgHeight,
    })
  })
}
