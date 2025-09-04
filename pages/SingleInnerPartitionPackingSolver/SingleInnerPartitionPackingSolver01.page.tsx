import { GenericSolverDebugger } from "lib/components/GenericSolverDebugger"
import { SingleInnerPartitionPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import { useMemo } from "react"
import input from "./SingleInnerPartitionPackingSolver01_input.json"
import type { InputProblem, PartitionInputProblem } from "lib/index"
import { getPinIdToStronglyConnectedPinsObj } from "lib/solvers/LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"

export default function PartitionPackingSolver01Page() {
  const solver = useMemo(() => {
    return new SingleInnerPartitionPackingSolver({
      partitionInputProblem: input as unknown as PartitionInputProblem,
      pinIdToStronglyConnectedPins: getPinIdToStronglyConnectedPinsObj(
        input as unknown as InputProblem,
      ),
    })
  }, [])

  return <GenericSolverDebugger solver={solver} />
}
