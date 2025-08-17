import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import type { InputProblem } from "lib/types/InputProblem"
import voltageRegulatorInput from "./voltage-regulator-matchpack-input.json"

export default function LayoutPipelineSolver05Page() {
  // Load InputProblem directly from JSON file
  const problem: InputProblem = voltageRegulatorInput as InputProblem

  return (
    <LayoutPipelineDebugger
      problem={problem}
    />
  )
}
