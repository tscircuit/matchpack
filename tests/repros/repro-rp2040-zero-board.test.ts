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
// expressed relative to the sub-group's occupied-bounds center. A board
// placement is applied by moving that center, so the composed schematic below
// translates each sub-layout by its group's board placement. group_1 (the LED,
// a single component) and P1 never get an inner matchpack run and stay opaque.
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
  const board = structuredClone(boardInput) as unknown as InputProblem
  // Apply core's occupied-bounds proxy without changing the captured fixture.
  board.chipMap.group_0!.size = { x: 9.075, y: 1.6 }
  for (const pinId of new Set(board.chipMap.group_0!.pins)) {
    const pin = board.chipPinMap[pinId]!
    pin.offset.x += 2.95
  }

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

    // Expanded sub-group: move its occupied-bounds center to the board placement.
    const subgroupLayout = solveProblem(subgroupInput)
    let subgroupContentCenterX = 0
    if (boardChipId === "group_0") {
      subgroupContentCenterX = -2.95
    }

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
        x: placement.x + boardPlacement.x - subgroupContentCenterX,
        y: placement.y + boardPlacement.y,
        ccwRotationDegrees: placement.ccwRotationDegrees,
      }
    }
  }

  const overlapChecker = new LayoutPipelineSolver(composedProblem)
  expect(overlapChecker.checkForOverlaps(composedLayout)).toEqual([])

  await expect({
    visualize: () => visualizeInputProblem(composedProblem, composedLayout),
  }).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 1200,
    svgHeight: 800,
  })
})
