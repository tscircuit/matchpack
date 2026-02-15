import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
// NOTE: Keep `problem` in a UI-free module so tests can import the fixture
// without pulling in React/UI dependencies (which can break CI bundling).
import { problem } from "./LayoutPipelineSolver06.problem"
export { problem } from "./LayoutPipelineSolver06.problem"
export default function LayoutPipelineSolver06Page() {
  return <LayoutPipelineDebugger problem={problem} />
}
