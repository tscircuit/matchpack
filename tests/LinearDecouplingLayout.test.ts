import { test, expect } from "bun:test"
import { SingleInnerPartitionPackingSolver } from "../lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "../lib/types/InputProblem"

test("LinearDecouplingLayout - 3 chips horizontal alignment", () => {
  // 构造包含 3 个不同尺寸芯片的 PartitionInputProblem
  const problem: PartitionInputProblem = {
    isPartition: true,
    partitionType: "decoupling_caps",
    chipMap: {
      C1: {
        chipId: "C1",
        pins: ["C1_P1", "C1_P2"],
        size: { x: 1.0, y: 0.5 },
        availableRotations: [0, 180],
      },
      C2: {
        chipId: "C2",
        pins: ["C2_P1", "C2_P2"],
        size: { x: 1.2, y: 0.6 },
        availableRotations: [0, 180],
      },
      C3: {
        chipId: "C3",
        pins: ["C3_P1", "C3_P2"],
        size: { x: 0.8, y: 0.4 },
        availableRotations: [0, 180],
      },
    },
    chipPinMap: {
      C1_P1: { pinId: "C1_P1", offset: { x: 0, y: 0.25 }, side: "y+" },
      C1_P2: { pinId: "C1_P2", offset: { x: 0, y: -0.25 }, side: "y-" },
      C2_P1: { pinId: "C2_P1", offset: { x: 0, y: 0.3 }, side: "y+" },
      C2_P2: { pinId: "C2_P2", offset: { x: 0, y: -0.3 }, side: "y-" },
      C3_P1: { pinId: "C3_P1", offset: { x: 0, y: 0.2 }, side: "y+" },
      C3_P2: { pinId: "C3_P2", offset: { x: 0, y: -0.2 }, side: "y-" },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {
      "C1_P1-VCC": true,
      "C1_P2-GND": true,
      "C2_P1-VCC": true,
      "C2_P2-GND": true,
      "C3_P1-VCC": true,
      "C3_P2-GND": true,
    },
    chipGap: 0.2,
    partitionGap: 2,
    decouplingCapsGap: 0.3,
  }

  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: problem,
    pinIdToStronglyConnectedPins: {},
  })

  // 执行布局
  solver.step()

  // 断言：布局已解决
  expect(solver.solved).toBe(true)
  expect(solver.layout).not.toBeNull()

  const placements = solver.layout!.chipPlacements

  // 断言：所有芯片的 y 坐标必须为 0
  expect(placements.C1!.y).toBe(0)
  expect(placements.C2!.y).toBe(0)
  expect(placements.C3!.y).toBe(0)

  // 断言：芯片按 chipId 排序 (C1, C2, C3)
  // C1 在左，C2 在中，C3 在右
  expect(placements.C1!.x).toBeLessThan(placements.C2!.x)
  expect(placements.C2!.x).toBeLessThan(placements.C3!.x)

  // 断言：芯片间的间距必须精确等于 gap (0.3)
  // C1 和 C2 之间的间距
  const gap1 = placements.C2!.x - placements.C1!.x - 1.0 / 2 - 1.2 / 2
  expect(Math.abs(gap1 - 0.3)).toBeLessThan(0.0001)

  // C2 和 C3 之间的间距
  const gap2 = placements.C3!.x - placements.C2!.x - 1.2 / 2 - 0.8 / 2
  expect(Math.abs(gap2 - 0.3)).toBeLessThan(0.0001)

  // 输出布局快照
  console.log("Layout Snapshot:", JSON.stringify(solver.layout, null, 2))
})
