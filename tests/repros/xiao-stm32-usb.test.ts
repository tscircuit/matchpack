import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem, PinId } from "../../lib/types/InputProblem"
import type { OutputLayout } from "../../lib/types/OutputLayout"
import {
  getRotatedSize,
  rotatePinOffset,
} from "../../lib/utils/rotatePinOffset"
import input from "../assets/xiao-stm32-usb.input.json"

const EXPECTED_DIRECT_TRACE_CLEARANCE = 0.2

const getAbsolutePinY = ({
  inputProblem,
  placements,
  pinId,
}: {
  inputProblem: InputProblem
  placements: OutputLayout["chipPlacements"]
  pinId: PinId
}): number => {
  const chip = Object.values(inputProblem.chipMap).find((candidate) =>
    candidate.pins.includes(pinId),
  )!
  const pin = inputProblem.chipPinMap[pinId]!
  const placement = placements[chip.chipId]!
  const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
  return placement.y + offset.y
}

test("xiao stm32 usb schematic layout", async () => {
  const inputProblem = input as InputProblem
  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solveUntilPhase("alignRegulatorCapacitorRowSolver")
  const regulatorYBeforeRowAlignment =
    solver.alignChipConnectedRailLoadsSolver!.outputLayout!.chipPlacements
      .U_LDO!.y
  solver.solve()

  const outputLayout = solver.getOutputLayout()
  const placements = outputLayout.chipPlacements
  expect(placements.C_VIN!.x).toBeLessThan(placements.U_LDO!.x)
  expect(placements.U_LDO!.x).toBeLessThan(placements.C_VOUT!.x)
  expect(placements.C_VOUT!.x).toBeLessThan(placements.C_MCU!.x)
  expect(placements.C_VOUT!.y).toBeCloseTo(placements.C_MCU!.y)
  expect(placements.U_LDO!.y).toBeCloseTo(regulatorYBeforeRowAlignment)
  for (const [regulatorPinId, capacitorPinId] of [
    ["U_LDO.2", "C_VIN.1"],
    ["U_LDO.3", "C_VOUT.1"],
    ["U_LDO.3", "C_MCU.1"],
  ] as const) {
    const regulatorPinY = getAbsolutePinY({
      inputProblem,
      placements,
      pinId: regulatorPinId,
    })
    const capacitorPinY = getAbsolutePinY({
      inputProblem,
      placements,
      pinId: capacitorPinId,
    })
    expect(capacitorPinY - regulatorPinY).toBeCloseTo(
      -EXPECTED_DIRECT_TRACE_CLEARANCE,
    )
  }
  const capacitorSize = getRotatedSize(
    inputProblem.chipMap.C_MCU!.size,
    placements.C_MCU!.ccwRotationDegrees,
  )
  const mcuSize = getRotatedSize(
    inputProblem.chipMap.U_MCU!.size,
    placements.U_MCU!.ccwRotationDegrees,
  )
  const regulatorRowToMcuGap =
    placements.U_MCU!.x -
    mcuSize.x / 2 -
    (placements.C_MCU!.x + capacitorSize.x / 2)
  expect(regulatorRowToMcuGap).toBeGreaterThanOrEqual(inputProblem.partitionGap)
  expect(solver.checkForOverlaps(outputLayout)).toEqual([])

  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
