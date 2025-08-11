import { useMemo } from "react"
import { ChipPartitionsSolver } from "lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import { PinRangeMatchSolver } from "lib/solvers/PinRangeMatchSolver/PinRangeMatchSolver"
import { PinRangeLayoutSolver } from "lib/solvers/PinRangeLayoutSolver/PinRangeLayoutSolver"
import { GenericSolverDebugger } from "lib/components/GenericSolverDebugger"
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

    // Use partitions for PinRangeMatchSolver
    const partitions = chipPartitionsSolver.partitions
    const partitionsToUse = partitions.length > 0 ? partitions : [problem]

    // Get pin ranges from PinRangeMatchSolver
    const pinRangeMatchSolver = new PinRangeMatchSolver(partitionsToUse)
    pinRangeMatchSolver.solve()

    if (pinRangeMatchSolver.failed) {
    }

    // Get all pin ranges for layout
    const pinRanges = pinRangeMatchSolver.getAllPinRanges()

    // Create PinRangeLayoutSolver with pin ranges and input problems
    const pinRangeLayoutSolver = new PinRangeLayoutSolver(
      pinRanges,
      partitionsToUse,
    )
    return pinRangeLayoutSolver
  }, [])

  return <GenericSolverDebugger solver={solver} />
}
