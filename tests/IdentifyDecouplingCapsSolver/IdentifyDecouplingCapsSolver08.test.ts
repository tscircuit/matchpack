import { expect, test } from "bun:test"
import { IdentifyDecouplingCapsSolver } from "../../lib/solvers/IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import input from "../../pages/repros/repro-adxl345-sch-auto-layout/repro-adxl345-sch-auto-layout.input.json"

test("groups fixed-rotation rail-only ADXL345 decoupling capacitors", () => {
  const solver = new IdentifyDecouplingCapsSolver(input as InputProblem)
  solver.solve()

  expect(solver.outputDecouplingCapGroups).toEqual([
    expect.objectContaining({
      mainChipId: "U1",
      decouplingCapChipIds: ["C1", "C2", "C3"],
    }),
  ])
})

test("does not guess when multiple chips share both capacitor rails", () => {
  const ambiguousInput = structuredClone(input) as InputProblem
  const powerNetId = Object.values(ambiguousInput.netMap).find(
    (net) => net.isPositiveVoltageSource,
  )!.netId
  const groundNetId = Object.values(ambiguousInput.netMap).find(
    (net) => net.isGround,
  )!.netId

  ambiguousInput.chipMap.J1 = {
    chipId: "J1",
    pins: ["J1.1", "J1.2"],
    size: { x: 1, y: 1 },
  }
  ambiguousInput.chipPinMap["J1.1"] = {
    pinId: "J1.1",
    offset: { x: 0, y: 0.3 },
    side: "y+",
  }
  ambiguousInput.chipPinMap["J1.2"] = {
    pinId: "J1.2",
    offset: { x: 0, y: -0.3 },
    side: "y-",
  }
  ambiguousInput.netConnMap[`J1.1-${powerNetId}`] = true
  ambiguousInput.netConnMap[`J1.2-${groundNetId}`] = true

  const solver = new IdentifyDecouplingCapsSolver(ambiguousInput)
  solver.solve()

  expect(solver.outputDecouplingCapGroups).toEqual([])
})
