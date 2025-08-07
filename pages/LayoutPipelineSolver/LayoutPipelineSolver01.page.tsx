import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import type { InputProblem } from "lib/types/InputProblem"
import { getExampleCircuitJson } from "../../tests/assets/ExampleCircuit01"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

export default function LayoutPipelineSolver01Page() {
  // Convert ExampleCircuit01 to InputProblem with readable IDs
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
