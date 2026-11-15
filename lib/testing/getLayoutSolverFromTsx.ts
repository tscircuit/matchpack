import type { ReactElement } from "react"
import { RootCircuit } from "tscircuit"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getInputProblemFromCircuitJsonSchematic } from "./getInputProblemFromCircuitJsonSchematic"

export const getLayoutSolverFromTsx = async (tsx: ReactElement) => {
  const circuit = new RootCircuit()
  circuit.pcbDisabled = true
  circuit.add(tsx)
  await circuit.renderUntilSettled()

  const problem = getInputProblemFromCircuitJsonSchematic(
    circuit.getCircuitJson(),
    { useReadableIds: true },
  )
  return new LayoutPipelineSolver(problem)
}
