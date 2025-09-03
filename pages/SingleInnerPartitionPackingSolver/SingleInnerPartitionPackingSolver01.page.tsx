import { GenericSolverDebugger } from "lib/components/GenericSolverDebugger"
import { SingleInnerPartitionPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import { useMemo } from "react"
import input from "./SingleInnerPartitionPackingSolver01_input.json"
import type { InputProblem } from "lib/index"

export default function PartitionPackingSolver01Page() {
  const solver = useMemo(() => {
    return new SingleInnerPartitionPackingSolver(
      input as unknown as InputProblem,
    )
  }, [])

  return <GenericSolverDebugger solver={solver} />
}
