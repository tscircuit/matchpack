import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import type { InputProblem } from "lib/types/InputProblem"
import SIJ021Input from "./si7021-matchpack-input.json"

export default function ReproSi7021Page() {
  const problem: InputProblem = SIJ021Input as InputProblem

  return <LayoutPipelineDebugger problem={problem} />
}
