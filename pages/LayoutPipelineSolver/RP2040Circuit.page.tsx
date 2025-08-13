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

  for (const chipId in problem.chipMap) {
    const chip = problem.chipMap[chipId]
    if (chip?.chipId.startsWith("C")) {
      chip.availableRotations = [0]
    }
  }

  return (
    <LayoutPipelineDebugger
      problem={problem}
      problemCircuitJson={circuitJson}
    />
  )
}
