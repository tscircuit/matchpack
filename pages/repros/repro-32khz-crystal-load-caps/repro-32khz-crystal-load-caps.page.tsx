import { GenericSolverDebugger } from "lib/components/GenericSolverDebugger"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { useMemo } from "react"
import input from "./repro-32khz-crystal-load-caps.input.json"

export default function Repro32khzCrystalLoadCapsPage() {
  const solver = useMemo(
    () => new LayoutPipelineSolver(input as InputProblem),
    [],
  )

  return <GenericSolverDebugger solver={solver} />
}
