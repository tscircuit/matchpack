import { GenericSolverDebugger } from "lib/components/GenericSolverDebugger"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { useMemo } from "react"
import input from "./repro-adxl345-sch-auto-layout.input.json"

export default function ReproAdxl345SchAutoLayoutPage() {
  const solver = useMemo(
    () => new LayoutPipelineSolver(input as InputProblem),
    [],
  )

  return <GenericSolverDebugger solver={solver} />
}
