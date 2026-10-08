import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro-rp2040-decoupling-capacitors.input.json"
import { getRotatedSize } from "lib/utils/rotatePinOffset"

/**
 * Issue #15 requires decoupling capacitors to sit neatly alongside the chip they decouple.
 * In the repro50 RP2040 fixture, U3 sits at x=+1.06 while its directly-wired caps
 * formerly landed at x=-4.3 to -11.7 across two y rows.
 *
 * PlaceChipConnectedDecouplingCapsSolver pulls the row to abut the main chip's edge
 * and aligns the positive rail pins.
 */

const getChipBounds = (
  solver: LayoutPipelineSolver,
  chipId: string,
): { minX: number; minY: number; maxX: number; maxY: number } | null => {
  const layout =
    solver.alignTestPointsSolver?.outputLayout ??
    solver.partitionPackingSolver?.finalLayout
  const placement = layout?.chipPlacements[chipId]
  const chip = inputProblem.chipMap[chipId as keyof typeof inputProblem.chipMap]
  if (!placement || !chip) return null
  const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
  return {
    minX: placement.x - size.x / 2,
    minY: placement.y - size.y / 2,
    maxX: placement.x + size.x / 2,
    maxY: placement.y + size.y / 2,
  }
}

test("directly-wired decoupling caps hug their main chip without overlap", () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const groups =
    solver.identifyDecouplingCapsSolver?.outputDecouplingCapGroups ?? []
  expect(groups.length).toBeGreaterThan(0)

  const mainChipId = groups[0]!.mainChipId
  const mainBounds = getChipBounds(solver, mainChipId)
  expect(mainBounds).not.toBeNull()

  const allChipIds = Object.keys(inputProblem.chipMap)
  const capsInGroups = new Set(
    groups.flatMap((g) => g.decouplingCapChipIds as string[]),
  )

  for (const groupId of new Set(groups.map((g) => g.decouplingCapGroupId))) {
    const group = groups.find((g) => g.decouplingCapGroupId === groupId)!
    const capBoundsList = group.decouplingCapChipIds
      .map((chipId) => getChipBounds(solver, chipId as string))
      .filter((b): b is NonNullable<typeof b> => b !== null)
    expect(capBoundsList.length).toBe(group.decouplingCapChipIds.length)

    const gapToMain = (
      capBounds: NonNullable<ReturnType<typeof getChipBounds>>,
    ) =>
      capBounds.minX > mainBounds!.maxX
        ? capBounds.minX - mainBounds!.maxX
        : capBounds.maxX < mainBounds!.minX
          ? mainBounds!.minX - capBounds.maxX
          : 0

    // The closest cap hugs the chip side. Intermediate partition members like
    // C10 sit between the row and the chip itself, so the nearest cap abuts that member's edge.
    const minGap = Math.min(...capBoundsList.map(gapToMain))
    expect(minGap).toBeGreaterThan(0)
    expect(minGap).toBeLessThanOrEqual(2.8)

    // The farthest cap of the row remains bounded.
    const maxGap = Math.max(...capBoundsList.map(gapToMain))
    expect(maxGap).toBeLessThanOrEqual(10.5)

    // The whole group is co-linear: one y row per group.
    const ys = capBoundsList.map((b) => (b.minY + b.maxY) / 2)
    const ySpread = Math.max(...ys) - Math.min(...ys)
    expect(ySpread).toBeLessThan(0.5)
  }

  // Caps must not overlap any other chip.
  for (const capId of capsInGroups) {
    const capBounds = getChipBounds(solver, capId as string)
    if (!capBounds) continue
    for (const otherId of allChipIds) {
      if (otherId === capId) continue
      const otherBounds = getChipBounds(solver, otherId)
      if (!otherBounds) continue
      const overlaps =
        capBounds.minX < otherBounds.maxX &&
        capBounds.maxX > otherBounds.minX &&
        capBounds.minY < otherBounds.maxY &&
        capBounds.maxY > otherBounds.minY
      expect(overlaps).toBe(false)
    }
  }
})
