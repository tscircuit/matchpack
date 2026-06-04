import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import type { InputProblem } from "lib/types/InputProblem"
import inputProblem from "./inputProblem.json"

export default function LayoutPipelineSolver05Page() {
  const problem: InputProblem = inputProblem as InputProblem
  return <LayoutPipelineDebugger problem={problem} />
}
