import { expect, test } from "bun:test"
import { IdentifyDecouplingCapsSolver } from "../../lib/solvers/IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "../../lib/types/InputProblem"
import inputProblem from "../assets/board-196038.input.json"

const modemCapacitorIds = [
  "C_MODEM_BULK",
  "C_MODEM_1U",
  "C_MODEM_100N",
  "C_MODEM_33N",
  "C_MODEM_10P",
]
const MAX_CAPACITOR_ROW_Y_SPREAD = 1e-9

test("groups grounded capacitors sharing a net pair without power metadata", () => {
  const solver = new IdentifyDecouplingCapsSolver(inputProblem as InputProblem)
  solver.solve()

  expect(solver.outputDecouplingCapGroups).toContainEqual(
    expect.objectContaining({
      mainChipId: "U_MODEM",
      mainChipSide: "x-",
      decouplingCapChipIds: modemCapacitorIds,
    }),
  )
  expect(
    solver.outputDecouplingCapGroups.some((group) =>
      group.decouplingCapChipIds.includes("C_GNSS_VDD"),
    ),
  ).toBe(false)
})

test("does not group grounded capacitors when the main chip is ambiguous", () => {
  const ambiguousInputProblem = structuredClone(inputProblem) as InputProblem
  ambiguousInputProblem.chipMap.J1 = {
    chipId: "J1",
    pins: ["J1.1", "J1.2"],
    size: { x: 1, y: 1 },
    availableRotations: [0],
  }
  ambiguousInputProblem.chipPinMap["J1.1"] = {
    pinId: "J1.1",
    offset: { x: 0, y: 0.3 },
    side: "y+",
  }
  ambiguousInputProblem.chipPinMap["J1.2"] = {
    pinId: "J1.2",
    offset: { x: 0, y: -0.3 },
    side: "y-",
  }
  const unmarkedPowerNetId = Object.keys(ambiguousInputProblem.netMap).find(
    (netId) =>
      ambiguousInputProblem.netConnMap[`C_MODEM_BULK.1-${netId}`] === true,
  )!
  const groundNetId = Object.keys(ambiguousInputProblem.netMap).find(
    (netId) =>
      ambiguousInputProblem.netConnMap[`C_MODEM_BULK.2-${netId}`] === true,
  )!
  ambiguousInputProblem.netConnMap[`J1.1-${unmarkedPowerNetId}`] = true
  ambiguousInputProblem.netConnMap[`J1.2-${groundNetId}`] = true

  const solver = new IdentifyDecouplingCapsSolver(ambiguousInputProblem)
  solver.solve()

  const groupedCapacitorIds = solver.outputDecouplingCapGroups.flatMap(
    (group) => group.decouplingCapChipIds,
  )
  for (const capacitorId of modemCapacitorIds) {
    expect(groupedCapacitorIds).not.toContain(capacitorId)
  }
})

test("places grounded capacitors sharing a net pair in a horizontal row", () => {
  const solver = new LayoutPipelineSolver(inputProblem as InputProblem)
  solver.solve()

  const chipPlacements = solver.getOutputLayout().chipPlacements
  const capacitorYCoordinates = modemCapacitorIds.map(
    (chipId) => chipPlacements[chipId]!.y,
  )
  const capacitorRowYSpread =
    Math.max(...capacitorYCoordinates) - Math.min(...capacitorYCoordinates)

  expect(capacitorRowYSpread).toBeLessThan(MAX_CAPACITOR_ROW_Y_SPREAD)
  expect(solver.checkForOverlaps(solver.getOutputLayout())).toEqual([])
})
