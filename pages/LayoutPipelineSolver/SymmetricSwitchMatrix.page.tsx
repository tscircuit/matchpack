import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import type { InputProblem } from "lib/types/InputProblem"
import { getSymmetricSwitchMatrixJson } from "../../tests/assets/SymmetricSwitchMatrix"

export default function SymmetricSwitchMatrixPage() {
  // Convert SymmetricSwitchMatrix to InputProblem with readable IDs
  const circuitJson = getSymmetricSwitchMatrixJson()
  const problem: InputProblem = getInputProblemFromCircuitJsonSchematic(
    circuitJson,
    { useReadableIds: true },
  )

  // Set constraints for symmetric components to help demonstrate the issue
  for (const chipId in problem.chipMap) {
    const chip = problem.chipMap[chipId]
    if (chip?.chipId.startsWith("C")) {
      // Force capacitors to 0 rotation for consistency
      chip.availableRotations = [0]
    }
    if (chip?.chipId.startsWith("R")) {
      // Force resistors to 0 rotation for consistency
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
