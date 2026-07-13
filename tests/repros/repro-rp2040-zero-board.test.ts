import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { visualizeInputProblem } from "lib/solvers/LayoutPipelineSolver/visualizeInputProblem"
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import boardInput from "./../assets/rp2040-zero-board.input.json"
import vregInput from "./../assets/rp2040-zero-board-vreg.input.json"
import flashInput from "./../assets/rp2040-zero-board-flash.input.json"
import crystalInput from "./../assets/rp2040-zero-board-crystal.input.json"
import rp2040Input from "./../assets/rp2040-zero-board-rp2040.input.json"

// Captured from @tscircuit/core's "matchpack-input-problem-*" debug output for
// the seveibar/rp2040-zero project (tests/projects/seveibar__rp2040-zero) — one
// consistent capture of core's whole hierarchical flow. core lays out every
// sub-group with its own pipeline run, then packs the sub-groups at the board
// level as opaque chips: each box's size is the sub-group's post-layout content
// bounds, its pins keep their absolute post-layout offsets, and both are
// expressed relative to the sub-group's *origin*. A board placement is applied
// by moving that origin, so the composed schematic below is each sub-layout
// translated by its group's board placement. group_1 (the LED, a single
// component) and P1 never get an inner matchpack run and stay opaque.
//
// Known collision: the VoltageRegulator sub-layout puts the C6/C1/C2 rail row
// well above its origin, so the row escapes group_0's reserved box and lands on
// U2 (0.19 clearance between bodies instead of the 1.2 partitionGap). The
// sub-group content bounds are not centered on the sub-group origin, while the
// board-level box that stands in for the sub-group is.
const subgroupInputByBoardChipId: Record<string, unknown> = {
  group_0: vregInput, // VoltageRegulator: U1 + C6/C1/C2/C5
  group_2: flashInput, // FlashCircuit: U2 + C3
  group_3: crystalInput, // CrystalCircuit: X1 + R8/C16/C17
  group_4: rp2040Input, // RP2040Circuit: U3 + decoupling caps
}

const solveProblem = (input: unknown): OutputLayout => {
  const solver = new LayoutPipelineSolver(input as InputProblem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  return solver.getOutputLayout()
}

test("repro rp2040-zero board layout composed from sub-group layouts", async () => {
  const board = boardInput as unknown as InputProblem

  const composedProblem: InputProblem = {
    chipMap: {},
    chipPinMap: {},
    netMap: { ...board.netMap },
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: board.chipGap,
    decouplingCapsGap: board.decouplingCapsGap,
    partitionGap: board.partitionGap,
  }
  const composedLayout: OutputLayout = {
    chipPlacements: {},
    groupPlacements: {},
  }

  const boardLayout = solveProblem(board)

  for (const [boardChipId, boardPlacement] of Object.entries(
    boardLayout.chipPlacements,
  )) {
    const subgroupInput = subgroupInputByBoardChipId[boardChipId] as
      | InputProblem
      | undefined

    if (!subgroupInput) {
      // Opaque leaf: keep the board-level box and its placement.
      const chip = board.chipMap[boardChipId]!
      composedProblem.chipMap[boardChipId] = chip
      for (const pinId of chip.pins) {
        composedProblem.chipPinMap[pinId] = board.chipPinMap[pinId]!
        for (const netId of Object.keys(board.netMap)) {
          if (board.netConnMap[`${pinId}-${netId}`]) {
            composedProblem.netConnMap[`${pinId}-${netId}`] = true
          }
        }
      }
      composedLayout.chipPlacements[boardChipId] = boardPlacement
      continue
    }

    // Expanded sub-group: its components keep their position relative to the
    // sub-group origin, and the origin moves to the board placement (this is
    // how core applies the board-level result).
    const subgroupLayout = solveProblem(subgroupInput)

    Object.assign(composedProblem.chipMap, subgroupInput.chipMap)
    Object.assign(composedProblem.chipPinMap, subgroupInput.chipPinMap)
    Object.assign(composedProblem.netMap, subgroupInput.netMap)
    Object.assign(composedProblem.netConnMap, subgroupInput.netConnMap)
    Object.assign(
      composedProblem.pinStrongConnMap,
      subgroupInput.pinStrongConnMap,
    )

    for (const [chipId, placement] of Object.entries(
      subgroupLayout.chipPlacements,
    )) {
      composedLayout.chipPlacements[chipId] = {
        x: placement.x + boardPlacement.x,
        y: placement.y + boardPlacement.y,
        ccwRotationDegrees: placement.ccwRotationDegrees,
      }
    }
  }

  await expect({
    visualize: () => visualizeInputProblem(composedProblem, composedLayout),
  }).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1200,
    svgHeight: 800,
  })
})
