import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { findSameSidePassiveGroups } from "lib/solvers/PackInnerPartitionsSolver/findSameSidePassiveGroups"
import type { InputProblem, PinId } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"

const allRotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270]

const si7021RailCarrierInput: InputProblem = {
  chipMap: {
    U1: {
      chipId: "U1",
      pins: ["U1.1", "U1.2", "U1.3", "U1.4"],
      size: { x: 1.2, y: 0.8 },
      availableRotations: [...allRotations],
    },
    R1: {
      chipId: "R1",
      pins: ["R1.1", "R1.2"],
      size: { x: 0.5, y: 1 },
      availableRotations: [...allRotations],
      isResistor: true,
    },
    R2: {
      chipId: "R2",
      pins: ["R2.1", "R2.2"],
      size: { x: 0.5, y: 1 },
      availableRotations: [...allRotations],
      isResistor: true,
    },
    SJ1: {
      chipId: "SJ1",
      pins: ["SJ1.1", "SJ1.2", "SJ1.3"],
      size: { x: 0.6, y: 0.6 },
      availableRotations: [...allRotations],
    },
  },
  chipPinMap: {
    "U1.1": {
      pinId: "U1.1",
      side: "x-",
      offset: { x: -1, y: 0.2 },
    },
    "U1.2": {
      pinId: "U1.2",
      side: "x-",
      offset: { x: -1, y: 0 },
    },
    "U1.3": {
      pinId: "U1.3",
      side: "x+",
      offset: { x: 1, y: -0.2 },
    },
    "U1.4": {
      pinId: "U1.4",
      side: "x+",
      offset: { x: 1, y: 0.2 },
    },
    "R1.1": {
      pinId: "R1.1",
      side: "y+",
      offset: { x: 0, y: 0.5 },
    },
    "R1.2": {
      pinId: "R1.2",
      side: "y-",
      offset: { x: 0, y: -0.5 },
    },
    "R2.1": {
      pinId: "R2.1",
      side: "y+",
      offset: { x: 0, y: 0.5 },
    },
    "R2.2": {
      pinId: "R2.2",
      side: "y-",
      offset: { x: 0, y: -0.5 },
    },
    "SJ1.1": {
      pinId: "SJ1.1",
      side: "x-",
      offset: { x: -0.3, y: 0 },
    },
    "SJ1.2": {
      pinId: "SJ1.2",
      side: "y+",
      offset: { x: 0, y: 0.3 },
    },
    "SJ1.3": {
      pinId: "SJ1.3",
      side: "x+",
      offset: { x: 0.3, y: 0 },
    },
  },
  netMap: {
    V3_3: { netId: "V3_3" },
    SCL: { netId: "SCL" },
    SDA: { netId: "SDA" },
  },
  pinStrongConnMap: {
    "U1.3-SCL": true,
    "U1.4-SDA": true,
    "R1.1-U1.4": true,
    "R2.1-U1.3": true,
    "SJ1.2-V3_3": true,
    "SJ1.3-R1.2": true,
    "SJ1.1-R2.2": true,
  },
  netConnMap: {
    "U1.3-SCL": true,
    "U1.4-SDA": true,
    "R1.1-SDA": true,
    "R2.1-SCL": true,
    "SJ1.2-V3_3": true,
    "SJ1.3-R1.2": true,
    "SJ1.1-R2.2": true,
  },
  chipGap: 0.4,
  partitionGap: 1.2,
}

const expectedComponentIds = ["R1", "R2", "SJ1", "U1"]
const relevantPinGeometry = {
  "U1.3": { side: "x+", offset: { x: 1, y: -0.2 } },
  "U1.4": { side: "x+", offset: { x: 1, y: 0.2 } },
  "R1.1": { side: "y+", offset: { x: 0, y: 0.5 } },
  "R1.2": { side: "y-", offset: { x: 0, y: -0.5 } },
  "R2.1": { side: "y+", offset: { x: 0, y: 0.5 } },
  "R2.2": { side: "y-", offset: { x: 0, y: -0.5 } },
  "SJ1.1": { side: "x-", offset: { x: -0.3, y: 0 } },
  "SJ1.2": { side: "y+", offset: { x: 0, y: 0.3 } },
  "SJ1.3": { side: "x+", offset: { x: 0.3, y: 0 } },
}
const strongEdges = [
  ["R1.1", "U1.4"],
  ["R2.1", "U1.3"],
  ["SJ1.3", "R1.2"],
  ["SJ1.1", "R2.2"],
] as const

const buildPinToChip = (inputProblem: InputProblem): Record<PinId, string> => {
  const pinToChip: Record<PinId, string> = {}
  for (const [chipId, chip] of Object.entries(inputProblem.chipMap)) {
    for (const pinId of chip.pins) pinToChip[pinId] = chipId
  }
  return pinToChip
}

const getPinPosition = (
  inputProblem: InputProblem,
  layout: OutputLayout,
  pinToChip: Record<PinId, string>,
  pinId: PinId,
) => {
  const chipId = pinToChip[pinId]!
  const placement = layout.chipPlacements[chipId]!
  const offset = rotatePinOffset(
    inputProblem.chipPinMap[pinId]!.offset,
    placement.ccwRotationDegrees,
  )

  return {
    x: placement.x + offset.x,
    y: placement.y + offset.y,
  }
}

const getStrongEdgeMetrics = (
  inputProblem: InputProblem,
  layout: OutputLayout,
) => {
  const pinToChip = buildPinToChip(inputProblem)

  return strongEdges.map(([a, b]) => {
    const pointA = getPinPosition(inputProblem, layout, pinToChip, a)
    const pointB = getPinPosition(inputProblem, layout, pinToChip, b)
    const dx = pointB.x - pointA.x
    const dy = pointB.y - pointA.y

    return {
      edge: `${a}-${b}`,
      manhattan: Math.abs(dx) + Math.abs(dy),
      offAxis: Math.min(Math.abs(dx), Math.abs(dy)),
    }
  })
}

test("SI7021 rail-carrier regression uses the reduced post-fix layout", async () => {
  expect(Object.keys(si7021RailCarrierInput.chipMap).sort()).toEqual(
    expectedComponentIds,
  )
  expect(JSON.stringify(si7021RailCarrierInput)).not.toContain("C2")
  expect(si7021RailCarrierInput.chipGap).toBe(0.4)
  expect(si7021RailCarrierInput.netConnMap["SJ1.2-V3_3"]).toBe(true)
  expect(si7021RailCarrierInput.chipMap.R1?.fixedPosition).toBeUndefined()
  expect(si7021RailCarrierInput.chipMap.R2?.fixedPosition).toBeUndefined()
  expect(si7021RailCarrierInput.chipMap.SJ1?.fixedPosition).toBeUndefined()
  expect(si7021RailCarrierInput.chipMap.R1?.pins).toHaveLength(2)
  expect(si7021RailCarrierInput.chipMap.R2?.pins).toHaveLength(2)
  expect(si7021RailCarrierInput.chipMap.SJ1?.pins).toHaveLength(3)
  expect(si7021RailCarrierInput.chipMap.R1?.isResistor).toBe(true)
  expect(si7021RailCarrierInput.chipMap.R2?.isResistor).toBe(true)
  for (const [pinId, geometry] of Object.entries(relevantPinGeometry)) {
    expect(si7021RailCarrierInput.chipPinMap[pinId]).toMatchObject(geometry)
  }
  expect(si7021RailCarrierInput.chipPinMap["U1.3"]?.side).toBe("x+")
  expect(si7021RailCarrierInput.chipPinMap["U1.4"]?.side).toBe("x+")
  expect(si7021RailCarrierInput.chipPinMap["U1.3"]?.offset).not.toEqual(
    si7021RailCarrierInput.chipPinMap["U1.4"]?.offset,
  )

  const groups = findSameSidePassiveGroups(si7021RailCarrierInput)
  const railCarrierGroups = groups.filter((group) => group.railCarrier)
  expect(groups).toHaveLength(1)
  expect(railCarrierGroups).toHaveLength(1)
  expect(railCarrierGroups[0]).toMatchObject({
    mainChipId: "U1",
    side: "x+",
    passiveChipIds: ["R2", "R1"],
    mainChipPinIds: ["U1.3", "U1.4"],
    railCarrier: {
      carrierChipId: "SJ1",
      passiveMainPinIds: ["R2.1", "R1.1"],
      passiveCarrierPinIds: ["R2.2", "R1.2"],
      carrierPinIds: ["SJ1.1", "SJ1.3"],
    },
  })

  const solver = new LayoutPipelineSolver(si7021RailCarrierInput)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(
    solver.packInnerPartitionsSolver?.completedSolvers[0]?.constructor.name,
  ).toBe("ParallelAlignedPassiveSolver")

  const layout = solver.getOutputLayout()
  expect(Object.keys(layout.chipPlacements).sort()).toEqual(
    expectedComponentIds,
  )
  expect(solver.checkForOverlaps(layout)).toHaveLength(0)

  const { U1, R1, R2, SJ1 } = layout.chipPlacements
  expect(U1?.ccwRotationDegrees).toBe(0)
  expect(R1?.ccwRotationDegrees).toBe(90)
  expect(R2?.ccwRotationDegrees).toBe(90)
  expect(SJ1?.ccwRotationDegrees).toBe(90)
  expect(R2!.x).toBeGreaterThan(U1!.x)
  expect(R1!.x).toBeGreaterThan(R2!.x)
  expect(SJ1!.x).toBeGreaterThan(R1!.x)
  expect(R2!.y).toBeLessThan(R1!.y)

  const pinToChip = buildPinToChip(si7021RailCarrierInput)
  const u1Scl = getPinPosition(
    si7021RailCarrierInput,
    layout,
    pinToChip,
    "U1.3",
  )
  const r2Main = getPinPosition(
    si7021RailCarrierInput,
    layout,
    pinToChip,
    "R2.1",
  )
  const u1Sda = getPinPosition(
    si7021RailCarrierInput,
    layout,
    pinToChip,
    "U1.4",
  )
  const r1Main = getPinPosition(
    si7021RailCarrierInput,
    layout,
    pinToChip,
    "R1.1",
  )
  expect(r2Main.y).toBeCloseTo(u1Scl.y)
  expect(r1Main.y).toBeCloseTo(u1Sda.y)
  expect(r2Main.x).toBeGreaterThan(u1Scl.x)
  expect(r1Main.x).toBeGreaterThan(u1Sda.x)

  const edgeMetrics = getStrongEdgeMetrics(si7021RailCarrierInput, layout)
  expect(edgeMetrics.map((metric) => metric.edge)).toEqual([
    "R1.1-U1.4",
    "R2.1-U1.3",
    "SJ1.3-R1.2",
    "SJ1.1-R2.2",
  ])
  expect(
    edgeMetrics.reduce((sum, metric) => sum + metric.manhattan, 0),
  ).toBeLessThan(5.9)
  expect(
    Math.max(...edgeMetrics.map((metric) => metric.offAxis)),
  ).toBeLessThanOrEqual(0.125)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgWidth: 640,
    svgHeight: 180,
  })
})
