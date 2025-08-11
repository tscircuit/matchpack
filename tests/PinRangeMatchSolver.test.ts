import { describe, it, expect } from "bun:test"
import {
  PinRangeMatchSolver,
  PartitionPinRangeMatchSolver,
} from "lib/solvers/PinRangeMatchSolver/PinRangeMatchSolver"
import type { InputProblem } from "lib/types/InputProblem"

describe("PinRangeMatchSolver", () => {
  it("should create pin ranges from a simple partition", () => {
    // Create a simple test partition with one chip
    const testPartition: InputProblem = {
      chipMap: {
        chip1: {
          chipId: "chip1",
          pins: ["pin1", "pin2", "pin3", "pin4"],
          size: { x: 1.0, y: 0.5 },
        },
      },
      chipPinMap: {
        pin1: { pinId: "pin1", offset: { x: 0, y: 0 }, side: "x-" },
        pin2: { pinId: "pin2", offset: { x: 0, y: 0.1 }, side: "x-" },
        pin3: { pinId: "pin3", offset: { x: 0, y: 0.2 }, side: "x-" },
        pin4: { pinId: "pin4", offset: { x: 1, y: 0 }, side: "x+" },
      },
      groupMap: {},
      groupPinMap: {},
      netMap: {},
      pinStrongConnMap: {},
      netConnMap: {},
    }

    const solver = new PartitionPinRangeMatchSolver(testPartition)
    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
    expect(solver.pinRanges).toHaveLength(2) // Should create 2 ranges: one for x- side, one for x+ side

    // Check x- side range (should contain pin1, pin2, pin3)
    const xMinusRange = solver.pinRanges.find((range) => range.side === "x-")
    expect(xMinusRange).toBeDefined()
    expect(xMinusRange!.pinIds).toHaveLength(3)
    expect(xMinusRange!.chipId).toBe("chip1")

    // Check x+ side range (should contain pin4)
    const xPlusRange = solver.pinRanges.find((range) => range.side === "x+")
    expect(xPlusRange).toBeDefined()
    expect(xPlusRange!.pinIds).toHaveLength(1)
    expect(xPlusRange!.pinIds).toContain("pin4")
  })

  it("should split ranges when pins are too far apart", () => {
    const testPartition: InputProblem = {
      chipMap: {
        chip1: {
          chipId: "chip1",
          pins: ["pin1", "pin2", "pin3"],
          size: { x: 1.0, y: 0.5 },
        },
      },
      chipPinMap: {
        pin1: { pinId: "pin1", offset: { x: 0, y: 0 }, side: "x-" },
        pin2: { pinId: "pin2", offset: { x: 0, y: 0.1 }, side: "x-" },
        pin3: { pinId: "pin3", offset: { x: 0, y: 0.5 }, side: "x-" }, // Far from others
      },
      groupMap: {},
      groupPinMap: {},
      netMap: {},
      pinStrongConnMap: {},
      netConnMap: {},
    }

    const solver = new PartitionPinRangeMatchSolver(testPartition)
    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.pinRanges).toHaveLength(2) // Should create 2 ranges due to gap

    const ranges = solver.pinRanges.filter((range) => range.side === "x-")
    expect(ranges).toHaveLength(2)
  })

  it("should limit pin range size to MAX_PIN_RANGE_SIZE", () => {
    const testPartition: InputProblem = {
      chipMap: {
        chip1: {
          chipId: "chip1",
          pins: ["pin1", "pin2", "pin3", "pin4", "pin5"],
          size: { x: 1.0, y: 0.5 },
        },
      },
      chipPinMap: {
        pin1: { pinId: "pin1", offset: { x: 0, y: 0 }, side: "x-" },
        pin2: { pinId: "pin2", offset: { x: 0, y: 0.05 }, side: "x-" },
        pin3: { pinId: "pin3", offset: { x: 0, y: 0.1 }, side: "x-" },
        pin4: { pinId: "pin4", offset: { x: 0, y: 0.15 }, side: "x-" },
        pin5: { pinId: "pin5", offset: { x: 0, y: 0.2 }, side: "x-" },
      },
      groupMap: {},
      groupPinMap: {},
      netMap: {},
      pinStrongConnMap: {},
      netConnMap: {},
    }

    const solver = new PartitionPinRangeMatchSolver(testPartition)
    solver.solve()

    expect(solver.solved).toBe(true)

    const ranges = solver.pinRanges.filter((range) => range.side === "x-")
    expect(ranges).toHaveLength(2) // Should split into 2 ranges (3+2)

    // Check that no range exceeds 3 pins
    ranges.forEach((range) => {
      expect(range.pinIds.length).toBeLessThanOrEqual(3)
    })
  })

  it("should process multiple partitions", () => {
    const partition1: InputProblem = {
      chipMap: {
        chip1: {
          chipId: "chip1",
          pins: ["pin1", "pin2"],
          size: { x: 1.0, y: 0.5 },
        },
      },
      chipPinMap: {
        pin1: { pinId: "pin1", offset: { x: 0, y: 0 }, side: "x-" },
        pin2: { pinId: "pin2", offset: { x: 0, y: 0.1 }, side: "x-" },
      },
      groupMap: {},
      groupPinMap: {},
      netMap: {},
      pinStrongConnMap: {},
      netConnMap: {},
    }

    const partition2: InputProblem = {
      chipMap: {
        chip2: {
          chipId: "chip2",
          pins: ["pin3"],
          size: { x: 1.0, y: 0.5 },
        },
      },
      chipPinMap: {
        pin3: { pinId: "pin3", offset: { x: 0, y: 0 }, side: "y+" },
      },
      groupMap: {},
      groupPinMap: {},
      netMap: {},
      pinStrongConnMap: {},
      netConnMap: {},
    }

    const solver = new PinRangeMatchSolver([partition1, partition2])
    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)

    const allRanges = solver.getAllPinRanges()
    expect(allRanges).toHaveLength(2) // One range from each partition
  })
})
