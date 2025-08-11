import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import type { InputProblem } from "lib/types/InputProblem"
import { getExampleCircuitJson } from "../../tests/assets/ExampleCircuit03"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

export default function LayoutPipelineSolver03Page() {
  // Convert ExampleCircuit02 to InputProblem with readable IDs
  const circuitJson = getExampleCircuitJson()
  const problem: InputProblem = getInputProblemFromCircuitJsonSchematic(
    circuitJson,
    { useReadableIds: true },
  )

  return (
    <LayoutPipelineDebugger
      problem={problem}
      problemCircuitJson={circuitJson}
    />
  )
}
