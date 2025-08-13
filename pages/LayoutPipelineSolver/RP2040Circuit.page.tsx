import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import type { InputProblem } from "lib/types/InputProblem"
import { getExampleCircuitJson } from "../../tests/assets/RP2040Circuit"

export default function RP2040CircuitPage() {
  // Convert RP2040Circuit to InputProblem with readable IDs
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
