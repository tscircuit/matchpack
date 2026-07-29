import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"

const inputProblem: InputProblem = {
  chipMap: {
    U1: {
      chipId: "U1",
      pins: ["U1.gnd", "U1.power", "U1.out"],
      size: { x: 1.2, y: 1.6 },
      availableRotations: [0],
    },
    C1: {
      chipId: "C1",
      pins: ["C1.1", "C1.2"],
      size: { x: 0.6, y: 0.84 },
      isCapacitor: true,
      availableRotations: [270],
    },
    C2: {
      chipId: "C2",
      pins: ["C2.1", "C2.2"],
      size: { x: 0.6, y: 0.84 },
      isCapacitor: true,
      availableRotations: [270],
    },
    C3: {
      chipId: "C3",
      pins: ["C3.1", "C3.2"],
      size: { x: 0.6, y: 0.84 },
      isCapacitor: true,
      availableRotations: [270],
    },
  },
  chipPinMap: {
    "U1.gnd": {
      pinId: "U1.gnd",
      offset: { x: -1, y: 0 },
      side: "x-",
    },
    "U1.power": {
      pinId: "U1.power",
      offset: { x: 1, y: 0.1 },
      side: "x+",
    },
    "U1.out": {
      pinId: "U1.out",
      offset: { x: 1, y: -0.1 },
      side: "x+",
    },
    "C1.1": {
      pinId: "C1.1",
      offset: { x: -0.3, y: 0 },
      side: "x-",
    },
    "C1.2": {
      pinId: "C1.2",
      offset: { x: 0.3, y: 0 },
      side: "x+",
    },
    "C2.1": {
      pinId: "C2.1",
      offset: { x: -0.3, y: 0 },
      side: "x-",
    },
    "C2.2": {
      pinId: "C2.2",
      offset: { x: 0.3, y: 0 },
      side: "x+",
    },
    "C3.1": {
      pinId: "C3.1",
      offset: { x: -0.3, y: 0 },
      side: "x-",
    },
    "C3.2": {
      pinId: "C3.2",
      offset: { x: 0.3, y: 0 },
      side: "x+",
    },
  },
  netMap: {
    ground: {
      netId: "ground",
      isGround: true,
    },
    power: {
      netId: "power",
      isPositiveVoltageSource: true,
    },
  },
  pinStrongConnMap: {
    "U1.out-C1.1": true,
    "C1.1-U1.out": true,
  },
  netConnMap: {
    "U1.gnd-ground": true,
    "U1.power-power": true,
    "C1.2-ground": true,
    "C2.1-power": true,
    "C2.2-ground": true,
    "C3.1-power": true,
    "C3.2-ground": true,
  },
  chipGap: 0.6,
  decouplingCapsGap: 0.4,
  partitionGap: 1.2,
}

test("places a net-only decoupling row after a direct connection", () => {
  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()

  const layout = solver.getOutputLayout()
  const mainPartitionRight = Math.max(
    layout.chipPlacements.U1!.x + 0.6,
    layout.chipPlacements.C1!.x + 0.42,
  )
  const weakPartitionLeft = Math.min(
    layout.chipPlacements.C2!.x - 0.42,
    layout.chipPlacements.C3!.x - 0.42,
  )

  expect(weakPartitionLeft - mainPartitionRight).toBeCloseTo(
    inputProblem.chipGap,
  )
  expect(layout.chipPlacements.C2!.y).toBeCloseTo(layout.chipPlacements.C1!.y)
  expect(layout.chipPlacements.C2!.x).toBeGreaterThan(
    layout.chipPlacements.C1!.x,
  )
  expect(solver.checkForOverlaps(layout)).toEqual([])
})

test("places a singleton net-only capacitor beside its matching pin", () => {
  const singletonInput = structuredClone(inputProblem)
  for (const chipId of ["C1", "C3"]) {
    const chip = singletonInput.chipMap[chipId]!
    for (const pinId of chip.pins) {
      delete singletonInput.chipPinMap[pinId]
      for (const connection of Object.keys(singletonInput.netConnMap)) {
        if (connection.startsWith(`${pinId}-`)) {
          delete singletonInput.netConnMap[connection]
        }
      }
    }
    delete singletonInput.chipMap[chipId]
  }
  singletonInput.pinStrongConnMap = {}

  const solver = new LayoutPipelineSolver(singletonInput)
  solver.solve()

  const layout = solver.getOutputLayout()
  const mainRight = layout.chipPlacements.U1!.x + 0.6
  const capLeft = layout.chipPlacements.C2!.x - 0.42
  const rotatedSignalPinY = layout.chipPlacements.C2!.y + 0.3
  const mainPowerPinY = layout.chipPlacements.U1!.y + 0.1

  expect(capLeft - mainRight).toBeCloseTo(singletonInput.chipGap)
  expect(rotatedSignalPinY).toBeCloseTo(mainPowerPinY)
  expect(solver.checkForOverlaps(layout)).toEqual([])
})
