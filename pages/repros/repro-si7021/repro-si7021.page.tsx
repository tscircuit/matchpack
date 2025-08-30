import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import type { InputProblem } from "lib/types/InputProblem"
import { getSi7021InputProblem } from "./getSi7021InputProblem"

export default function ReproSi7021Page() {
  // Generate InputProblem from the circuit definition
  const problem: InputProblem = getSi7021InputProblem()

  return <LayoutPipelineDebugger problem={problem} />
}
