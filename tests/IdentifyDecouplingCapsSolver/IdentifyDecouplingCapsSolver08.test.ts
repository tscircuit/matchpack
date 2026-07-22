import { expect, test } from "bun:test"
import { IdentifyDecouplingCapsSolver } from "../../lib/solvers/IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../../pages/repros/repro-adxl345-sch-auto-layout/repro-adxl345-sch-auto-layout.input.json"

test("groups fixed-rotation decoupling capacitors with explicit chip connections", () => {
  const connectedInput = structuredClone(input) as InputProblem
  connectedInput.pinStrongConnMap = {
    "C1.1-U1.1": true,
    "C2.1-U1.1": true,
    "C3.1-U1.1": true,
  }

  const solver = new IdentifyDecouplingCapsSolver(connectedInput)
  solver.solve()

  expect(solver.outputDecouplingCapGroups).toEqual([
    expect.objectContaining({
      mainChipId: "U1",
      decouplingCapChipIds: ["C1", "C2", "C3"],
    }),
  ])
})
