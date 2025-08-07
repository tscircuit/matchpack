import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { useMemo, useReducer } from "react"
import { InteractiveGraphics } from "graphics-debug/react"
import { LayoutPipelineToolbar } from "./LayoutPipelineToolbar"

export const LayoutPipelineDebugger = ({
  problem,
}: {
  problem: InputProblem
}) => {
  const [runCount, incRunCount] = useReducer((x) => x + 1, 0)
  const solver = useMemo(() => new LayoutPipelineSolver(problem), [])

  return (
    <div>
      <LayoutPipelineToolbar
        onStep={() => {
          solver.step()
          incRunCount()
        }}
        onSolve={() => {
          solver.solve()
          incRunCount()
        }}
      />
      <InteractiveGraphics graphics={solver.visualize()} />
    </div>
  )
}
