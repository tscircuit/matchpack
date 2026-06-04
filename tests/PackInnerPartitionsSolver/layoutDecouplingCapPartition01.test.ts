import { expect, test } from "bun:test"
import { layoutDecouplingCapPartition } from "lib/solvers/PackInnerPartitionsSolver/layoutDecouplingCapPartition"
import { SingleInnerPartitionPackingSolver } from "lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "lib/types/InputProblem"

/**
 * Decoupling capacitor partition where one capacitor (C3) is wired flipped:
 * its pin 1 (top at rotation 0) connects to GND instead of VCC. The layout
 * must rotate it 180 degrees so every capacitor in the bank has its
 * VCC-connected pin facing y+ and its GND-connected pin facing y-.
 */
const createDecapPartition = (): PartitionInputProblem => ({
  chipMap: {
    C10: {
      chipId: "C10",
      pins: ["C10.1", "C10.2"],
      size: { x: 0.53, y: 1.06 },
      availableRotations: [0, 180],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 0.53, y: 1.06 },
      availableRotations: [0, 180],
    },
    C3: {
      chipId: "C3",
      pins: ["C3.1", "C3.2"],
      size: { x: 0.53, y: 1.06 },
      availableRotations: [0, 180],
    },
  },
  chipPinMap: {
    "C10.1": { pinId: "C10.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C10.2": { pinId: "C10.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C2.1": { pinId: "C2.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C2.2": { pinId: "C2.2", offset: { x: 0, y: -0.55 }, side: "y-" },
    "C3.1": { pinId: "C3.1", offset: { x: 0, y: 0.55 }, side: "y+" },
    "C3.2": { pinId: "C3.2", offset: { x: 0, y: -0.55 }, side: "y-" },
  },
  netMap: {
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
    GND: { netId: "GND", isGround: true },
  },
  pinStrongConnMap: {},
  netConnMap: {
    "C10.1-VCC": true,
    "C10.2-GND": true,
    "C2.1-VCC": true,
    "C2.2-GND": true,
    // C3 is wired flipped: pin 1 (top) goes to GND
    "C3.1-GND": true,
    "C3.2-VCC": true,
  },
  chipGap: 0.6,
  decouplingCapsGap: 0.2,
  partitionGap: 1.2,
  isPartition: true,
  partitionType: "decoupling_caps",
})

test("layoutDecouplingCapPartition lays caps out as a uniform bank", () => {
  const partition = createDecapPartition()
  const layout = layoutDecouplingCapPartition(partition)

  const c2 = layout.chipPlacements["C2"]!
  const c3 = layout.chipPlacements["C3"]!
  const c10 = layout.chipPlacements["C10"]!

  // Deterministic natural ordering: C2, C3, C10 from left to right
  expect(c2.x).toBeLessThan(c3.x)
  expect(c3.x).toBeLessThan(c10.x)

  // Uniform pitch: cap width (0.53) + decouplingCapsGap (0.2)
  expect(c3.x - c2.x).toBeCloseTo(0.73, 5)
  expect(c10.x - c3.x).toBeCloseTo(0.73, 5)

  // All caps aligned on the same row
  expect(c2.y).toBeCloseTo(c3.y, 5)
  expect(c3.y).toBeCloseTo(c10.y, 5)

  // Uniform orientation: VCC pin faces y+, GND pin faces y-.
  // C2 and C10 are wired normally so they stay at 0; C3 is wired flipped
  // so it must be rotated 180
  expect(c2.ccwRotationDegrees).toBe(0)
  expect(c10.ccwRotationDegrees).toBe(0)
  expect(c3.ccwRotationDegrees).toBe(180)

  // The VCC pins form a straight rail at the same y coordinate
  const vccPinY = (placement: { y: number }, pinOffsetY: number) =>
    placement.y + pinOffsetY
  const c2VccY = vccPinY(c2, 0.55) // C2.1 at rotation 0
  const c3VccY = vccPinY(c3, 0.55) // C3.2 at rotation 180: -(-0.55)
  const c10VccY = vccPinY(c10, 0.55) // C10.1 at rotation 0
  expect(c2VccY).toBeCloseTo(c3VccY, 5)
  expect(c3VccY).toBeCloseTo(c10VccY, 5)
})

test("layoutDecouplingCapPartition wraps large groups into balanced rows", () => {
  const partition = createDecapPartition()

  // Expand to 10 identical caps (C1..C10) to exceed the 8-per-row maximum
  for (let i = 1; i <= 10; i++) {
    const chipId = `C${i}`
    if (partition.chipMap[chipId]) continue
    partition.chipMap[chipId] = {
      chipId,
      pins: [`${chipId}.1`, `${chipId}.2`],
      size: { x: 0.53, y: 1.06 },
      availableRotations: [0, 180],
    }
    partition.chipPinMap[`${chipId}.1`] = {
      pinId: `${chipId}.1`,
      offset: { x: 0, y: 0.55 },
      side: "y+",
    }
    partition.chipPinMap[`${chipId}.2`] = {
      pinId: `${chipId}.2`,
      offset: { x: 0, y: -0.55 },
      side: "y-",
    }
    partition.netConnMap[`${chipId}.1-VCC`] = true
    partition.netConnMap[`${chipId}.2-GND`] = true
  }

  const layout = layoutDecouplingCapPartition(partition)

  const ys = new Set(
    Object.values(layout.chipPlacements).map((p) => p.y.toFixed(5)),
  )
  // 10 caps wrap into 2 balanced rows of 5
  expect(ys.size).toBe(2)
  const rowYs = [...ys].map(Number).sort((a, b) => b - a)
  const capsInTopRow = Object.values(layout.chipPlacements).filter(
    (p) => p.y.toFixed(5) === rowYs[0]!.toFixed(5),
  )
  expect(capsInTopRow.length).toBe(5)
})

test("SingleInnerPartitionPackingSolver uses the bank layout for decoupling_caps partitions", async () => {
  const partition = createDecapPartition()
  const solver = new SingleInnerPartitionPackingSolver({
    partitionInputProblem: partition,
    pinIdToStronglyConnectedPins: {},
  })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.layout).not.toBeNull()
  expect(solver.layout).toEqual(layoutDecouplingCapPartition(partition))

  await expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path, {
    svgName: "decouplingCapBank01",
  })
})
