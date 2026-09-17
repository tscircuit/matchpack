import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import inputProblem from "../assets/repro-rp2040-decoupling-capacitors.input.json"
import { getRotatedSize } from "lib/utils/rotatePinOffset"

/**
 * Issue #15's "acceptable solution" requires the decoupling caps to sit right
 * next to the chip they decouple. On main, the directly-wired cap partition is
 * packed wherever the global packer has room: for the repro50 RP2040 fixture
 * the caps land at x -4.3..-11.7 spread over two y rows while U3 sits at
 * x=+1.06, and no pipeline phase moves them (the net-only row solver bails out
 * on pin-to-pin wired caps).
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

    const gapToMain = (capBounds: NonNullable<ReturnType<typeof getChipBounds>>) =>
      capBounds.minX > mainBounds!.maxX
        ? capBounds.minX - mainBounds!.maxX
        : capBounds.maxX < mainBounds!.minX
          ? mainBounds!.minX - capBounds.maxX
          : 0

    // The closest cap hugs the chip side (intermediate partition members like
    // C10 sit between the row and the chip itself, so measure the nearest).
    const minGap = Math.min(...capBoundsList.map(gapToMain))
    expect(minGap).toBeLessThanOrEqual(1.2)

    // The farthest cap stays within a few body-widths of the chip (on main it
    // was ~11 units away).
    const maxGap = Math.max(...capBoundsList.map(gapToMain))
    expect(maxGap).toBeLessThanOrEqual(3.5)

    // The whole group is roughly co-linear: one y row per group.
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
