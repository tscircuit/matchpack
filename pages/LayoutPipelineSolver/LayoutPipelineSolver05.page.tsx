import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import type { InputProblem } from "lib/types/InputProblem"
import { getExampleCircuitJson } from "../../tests/assets/ExampleCircuit03"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

export default function LayoutPipelineSolver05Page() {
  // Convert ExampleCircuit03 to InputProblem with readable IDs
  const circuitJson = getExampleCircuitJson()
  const problem: InputProblem = getInputProblemFromCircuitJsonSchematic(
    circuitJson,
    { useReadableIds: true },
  )

  // Modify capacitors to only allow [0, 180] rotations
  for (const [chipId, chip] of Object.entries(problem.chipMap)) {
    // Check if this is a capacitor (starts with C followed by a number)
    if (/^C\d+$/.test(chipId) || chipId.toLowerCase().includes("capacitor")) {
      chip.availableRotations = [0, 180]
    }
  }

  return (
    <LayoutPipelineDebugger
      problem={problem}
      problemCircuitJson={circuitJson}
    />
  )
}
