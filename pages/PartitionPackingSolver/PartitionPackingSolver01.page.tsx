import { useMemo } from "react"
import { GenericSolverDebugger } from "lib/components/GenericSolverDebugger"
import { PartitionPackingSolver } from "lib/solvers/PartitionPackingSolver/PartitionPackingSolver"
import { PinRangeOverlapSolver } from "lib/solvers/PinRangeOverlapSolver/PinRangeOverlapSolver"
import { PinRangeLayoutSolver } from "lib/solvers/PinRangeLayoutSolver/PinRangeLayoutSolver"
import { PinRangeMatchSolver } from "lib/solvers/PinRangeMatchSolver/PinRangeMatchSolver"
import { ChipPartitionsSolver } from "lib/solvers/ChipPartitionsSolver/ChipPartitionsSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { getExampleCircuitJson } from "../../tests/assets/ExampleCircuit01"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

export default function PartitionPackingSolver01Page() {
  const circuitJson = getExampleCircuitJson()
  const problem: InputProblem = getInputProblemFromCircuitJsonSchematic(
    circuitJson,
    { useReadableIds: true },
  )

  const solver = useMemo(() => {
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
      throw new Error("PinRangeMatchSolver failed")
    }

    // Get all pin ranges for layout
    const pinRanges = pinRangeMatchSolver.getAllPinRanges()

    // Create PinRangeLayoutSolver with pin ranges and input problems
    const pinRangeLayoutSolver = new PinRangeLayoutSolver(
      pinRanges,
      partitionsToUse,
    )
    pinRangeLayoutSolver.solve()

    if (pinRangeLayoutSolver.failed) {
      throw new Error("PinRangeLayoutSolver failed")
    }

    // Create PinRangeOverlapSolver
    const pinRangeOverlapSolver = new PinRangeOverlapSolver(
      pinRangeLayoutSolver,
      partitionsToUse,
    )
    pinRangeOverlapSolver.solve()

    if (pinRangeOverlapSolver.failed) {
      throw new Error("PinRangeOverlapSolver failed")
    }

    return new PartitionPackingSolver(pinRangeOverlapSolver, partitionsToUse)
  }, [problem])

  return <GenericSolverDebugger solver={solver} />
}
