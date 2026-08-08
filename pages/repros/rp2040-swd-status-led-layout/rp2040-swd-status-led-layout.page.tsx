import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import type { InputProblem } from "lib/types/InputProblem"
import input from "../../../tests/assets/rp2040-swd-status-led-layout.input.json"

export default function Rp2040SwdStatusLedLayoutPage() {
  return <LayoutPipelineDebugger problem={input as InputProblem} />
}
