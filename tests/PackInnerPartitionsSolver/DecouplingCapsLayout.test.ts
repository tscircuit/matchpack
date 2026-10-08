import { describe, it, expect } from "bun:test"
import { applyDecouplingCapsLinearLayout } from "../../lib/solvers/PackInnerPartitionsSolver/DecouplingCapsLinearLayoutSolver"

describe("applyDecouplingCapsLinearLayout", () => {
  it("places a single cap at origin", () => {
    const chips = [
      { chipId: "C1", center: { x: 99, y: 99 }, ccwRotationDegrees: 45 },
    ]
    applyDecouplingCapsLinearLayout(chips)
    expect(chips[0]!.center!.x).toBeCloseTo(0)
    expect(chips[0]!.center!.y).toBeCloseTo(0)
    expect(chips[0]!.ccwRotationDegrees).toBe(0)
  })

  it("centers multiple caps in a horizontal row", () => {
    const chips = [
      { chipId: "C1", center: { x: 0, y: 0 }, ccwRotationDegrees: 0 },
      { chipId: "C2", center: { x: 0, y: 0 }, ccwRotationDegrees: 0 },
      { chipId: "C3", center: { x: 0, y: 0 }, ccwRotationDegrees: 0 },
    ]
    applyDecouplingCapsLinearLayout(chips, { decouplingCapsGap: 0.2 })

    // total width = 3*1 + 2*0.2 = 3.4, centered → x in [-1.2, 0, 1.2]
    const xs = chips.map((c) => c.center!.x).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(-1.2)
    expect(xs[1]).toBeCloseTo(0)
    expect(xs[2]).toBeCloseTo(1.2)

    chips.forEach((c) => expect(c.center!.y).toBeCloseTo(0))
  })

  it("does nothing for empty array", () => {
    expect(() => applyDecouplingCapsLinearLayout([])).not.toThrow()
  })

  it("sorts chips by chipId before laying out", () => {
    const chips = [
      { chipId: "C3", center: { x: 0, y: 0 }, ccwRotationDegrees: 0 },
      { chipId: "C1", center: { x: 0, y: 0 }, ccwRotationDegrees: 0 },
    ]
    applyDecouplingCapsLinearLayout(chips, { decouplingCapsGap: 0 })
    // C1 should be leftmost after sort
    const c1 = chips.find((c) => c.chipId === "C1")!
    const c3 = chips.find((c) => c.chipId === "C3")!
    expect(c1.center!.x).toBeLessThan(c3.center!.x)
  })
})
