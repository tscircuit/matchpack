import { useMemo } from "react"
import { ChipPartitionsSolver } from "lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import { GenericSolverDebugger } from "lib/components/GenericSolverDebugger"
import { PinRangeMatchSolver } from "lib/solvers/PinRangeMatchSolver/PinRangeMatchSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import { getExampleCircuitJson } from "../../tests/assets/ExampleCircuit02"

export default () => {
  const solver = useMemo(() => {
    // Get ExampleCircuit02 and convert to InputProblem with readable IDs
    const circuitJson = getExampleCircuitJson()
    const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
      useReadableIds: true,
    })

    // Create partitions using ChipPartitionsSolver
    const chipPartitionsSolver = new ChipPartitionsSolver(problem)
    chipPartitionsSolver.solve()

    // Use partitions for PinRangeMatchSolver (expects array of InputProblem)
    const partitions = chipPartitionsSolver.partitions
    const partitionsToUse = partitions.length > 0 ? partitions : [problem] // fallback to full problem if no partitions

    const pinRangeMatchSolver = new PinRangeMatchSolver(partitionsToUse)
    return pinRangeMatchSolver
  }, [])

  return <GenericSolverDebugger solver={solver} />
}
