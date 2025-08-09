import type { BaseSolver } from "lib/solvers/BaseSolver"
import { useMemo, useReducer, useState } from "react"
import { InteractiveGraphics } from "graphics-debug/react"

interface GenericToolbarProps {
  onStep: () => void
  onSolve: () => void
  activeSubSolverName?: string
  iterations: number
}

const GenericToolbar = (props: GenericToolbarProps) => {
  return (
    <div className="flex gap-2 p-2">
      <button onClick={props.onStep}>Step</button>
      <button onClick={props.onSolve}>Solve</button>
      <div>Iterations: {props.iterations}</div>
      {props.activeSubSolverName && (
        <div className="flex items-center px-3 py-1 bg-gray-100 rounded text-sm">
          Active: {props.activeSubSolverName}
        </div>
      )}
    </div>
  )
}

export const GenericSolverDebugger = ({ solver }: { solver: BaseSolver }) => {
  const [runCount, incRunCount] = useReducer((x) => x + 1, 0)

  return (
    <div>
      <GenericToolbar
        iterations={solver.iterations}
        onStep={() => {
          solver.step()
          incRunCount()
        }}
        onSolve={() => {
          solver.solve()
          incRunCount()
        }}
        activeSubSolverName={solver.constructor.name}
      />
      <InteractiveGraphics graphics={solver.visualize()} />
    </div>
  )
}
