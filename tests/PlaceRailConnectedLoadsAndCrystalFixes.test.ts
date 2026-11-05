import { expect, test } from "bun:test"
import { IdentifyCrystalCircuitsSolver } from "../lib/solvers/IdentifyCrystalCircuitsSolver/IdentifyCrystalCircuitsSolver"
import { LayoutPipelineSolver } from "../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { placeRailConnectedLoads } from "../lib/solvers/PlaceRailConnectedLoadsSolver/placeRailConnectedLoads"
import type {
  InputProblem,
  PartitionInputProblem,
} from "../lib/types/InputProblem"
import verticalCrystalInput from "./assets/repro-32khz-crystal-load-caps.input.json"
import crystalInput from "./assets/rp2040-zero-board-crystal.input.json"

test("placeRailConnectedLoads aligns the load pin on the same rail net as the decoupling row upper pin and avoids left-extending load collisions", () => {
  const inputProblem: InputProblem = {
    chipMap: {
      C_DECAP: {
        chipId: "C_DECAP",
        pins: ["C_DECAP.1", "C_DECAP.2"],
        size: { x: 1, y: 1 },
        isCapacitor: true,
        availableRotations: [0],
      },
      R_TOP: {
        chipId: "R_TOP",
        pins: ["R_TOP.1", "R_TOP.2"],
        size: { x: 1, y: 1 },
        isResistor: true,
        availableRotations: [0],
      },
      D_BOT: {
        chipId: "D_BOT",
        pins: ["D_BOT.1", "D_BOT.2"],
        size: { x: 1, y: 1 },
        availableRotations: [0],
      },
    },
    chipPinMap: {
      "C_DECAP.1": {
        pinId: "C_DECAP.1",
        offset: { x: 0, y: 0.5 },
        side: "y+",
      },
      "C_DECAP.2": {
        pinId: "C_DECAP.2",
        offset: { x: 0, y: -0.5 },
        side: "y-",
      },
      "R_TOP.1": {
        pinId: "R_TOP.1",
        offset: { x: 0, y: 0.5 },
        side: "y+",
      },
      "R_TOP.2": {
        pinId: "R_TOP.2",
        offset: { x: 0, y: -0.5 },
        side: "y-",
      },
      "D_BOT.1": {
        pinId: "D_BOT.1",
        offset: { x: 0, y: -0.5 },
        side: "y-",
      },
      "D_BOT.2": {
        pinId: "D_BOT.2",
        offset: { x: 0, y: 0.5 },
        side: "y+",
      },
    },
    netMap: {
      VCC: {
        netId: "VCC",
        isGround: false,
        isPositiveVoltageSource: true,
      },
      GND: {
        netId: "GND",
        isGround: true,
        isPositiveVoltageSource: false,
      },
    },
    pinStrongConnMap: {
      "R_TOP.2-D_BOT.1": true,
      "D_BOT.1-R_TOP.2": true,
    },
    netConnMap: {
      "C_DECAP.1-VCC": true,
      "C_DECAP.2-GND": true,
      "R_TOP.1-VCC": true,
      "D_BOT.2-GND": true,
    },
    chipGap: 0.6,
    decouplingCapsGap: 0.4,
    partitionGap: 1.2,
  }

  const decapPartition: PartitionInputProblem = {
    ...inputProblem,
    partitionType: "decoupling_caps",
    chipMap: { C_DECAP: inputProblem.chipMap.C_DECAP! },
  }
  const loadPartition: PartitionInputProblem = {
    ...inputProblem,
    partitionType: "default",
    chipMap: {
      R_TOP: inputProblem.chipMap.R_TOP!,
      D_BOT: inputProblem.chipMap.D_BOT!,
    },
  }

  // Place D_BOT higher and further left than R_TOP so:
  // 1) D_BOT's GND pin (y = 2.5) is higher than R_TOP's VCC pin (y = 0.5).
  // 2) D_BOT extends 1.5 units left of R_TOP, which would overlap C_DECAP if
  //    anchored solely by R_TOP's minX.
  const inputLayout = {
    chipPlacements: {
      C_DECAP: { x: 0, y: 0, ccwRotationDegrees: 0 },
      R_TOP: { x: 10, y: 0, ccwRotationDegrees: 0 },
      D_BOT: { x: 8.5, y: 2, ccwRotationDegrees: 0 },
    },
    groupPlacements: {},
  }

  const output = placeRailConnectedLoads({
    inputProblem,
    inputLayout,
    packedPartitions: [
      { inputProblem: decapPartition, layout: inputLayout },
      { inputProblem: loadPartition, layout: inputLayout },
    ],
    groundedLoadPairs: [],
  })

  // R_TOP's VCC pin (offset +0.5) should align with C_DECAP's VCC pin (y = +0.5),
  // so R_TOP.y remains 0 instead of aligning D_BOT's GND pin (y = 2.5) with y = 0.5.
  expect(output.chipPlacements.R_TOP!.y).toBeCloseTo(0)
  // Leftmost load chip (D_BOT, width 1) is placed partitionGap (1.2) to the right
  // of C_DECAP's right edge (0.5), so D_BOT.minX = 1.7 => D_BOT.x = 2.2.
  expect(output.chipPlacements.D_BOT!.x).toBeCloseTo(2.2)
  expect(output.chipPlacements.R_TOP!.x).toBeCloseTo(3.7)
})

test("IdentifyCrystalCircuitsSolver excludes positive-rail pull-up resistors and ambiguous multi-resistor crystal pins", () => {
  const input = structuredClone(crystalInput) as InputProblem

  // Change R8's outward net to a positive voltage rail (pull-up resistor).
  input.netMap
    .unnamedsubcircuitsubcircuit_source_group_5_connectivity_net33!.isPositiveVoltageSource =
    true

  const pullUpSolver = new IdentifyCrystalCircuitsSolver(input)
  pullUpSolver.solve()
  expect(pullUpSolver.outputCrystalCircuitGroups[0]?.seriesResistors).toEqual(
    [],
  )

  // Restore signal net and add a second resistor on the same crystal pin X1.3.
  input.netMap
    .unnamedsubcircuitsubcircuit_source_group_5_connectivity_net33!.isPositiveVoltageSource =
    false
  input.chipMap.R9 = {
    chipId: "R9",
    pins: ["R9.1", "R9.2"],
    size: { x: 0.97, y: 0.6 },
    isCapacitor: false,
    isResistor: true,
    availableRotations: [0],
  }
  input.chipPinMap["R9.1"] = {
    pinId: "R9.1",
    offset: { x: 0, y: 0.3 },
    side: "y+",
  }
  input.chipPinMap["R9.2"] = {
    pinId: "R9.2",
    offset: { x: 0, y: -0.3 },
    side: "y-",
  }
  input.pinStrongConnMap["X1.3-R9.2"] = true
  input.pinStrongConnMap["R9.2-X1.3"] = true
  input.netConnMap[
    "R9.1-unnamedsubcircuitsubcircuit_source_group_5_connectivity_net33"
  ] = true

  const multiResistorSolver = new IdentifyCrystalCircuitsSolver(input)
  multiResistorSolver.solve()
  expect(
    multiResistorSolver.outputCrystalCircuitGroups[0]?.seriesResistors,
  ).toEqual([])
})

test("CrystalCircuitLayoutSolver separates two series resistors horizontally on a vertically locked crystal", () => {
  const input = structuredClone(verticalCrystalInput) as InputProblem
  input.chipMap.X1!.availableRotations = [90]

  input.chipMap.R1 = {
    chipId: "R1",
    pins: ["R1.1", "R1.2"],
    size: { x: 0.6, y: 1.0 },
    isCapacitor: false,
    isResistor: true,
    availableRotations: [0],
  }
  input.chipMap.R2 = {
    chipId: "R2",
    pins: ["R2.1", "R2.2"],
    size: { x: 0.6, y: 1.0 },
    isCapacitor: false,
    isResistor: true,
    availableRotations: [0],
  }
  input.chipPinMap["R1.1"] = {
    pinId: "R1.1",
    offset: { x: 0, y: 0.5 },
    side: "y+",
  }
  input.chipPinMap["R1.2"] = {
    pinId: "R1.2",
    offset: { x: 0, y: -0.5 },
    side: "y-",
  }
  input.chipPinMap["R2.1"] = {
    pinId: "R2.1",
    offset: { x: 0, y: 0.5 },
    side: "y+",
  }
  input.chipPinMap["R2.2"] = {
    pinId: "R2.2",
    offset: { x: 0, y: -0.5 },
    side: "y-",
  }
  input.netMap.OSC_OUT_1 = {
    netId: "OSC_OUT_1",
    isGround: false,
    isPositiveVoltageSource: false,
  }
  input.netMap.OSC_OUT_2 = {
    netId: "OSC_OUT_2",
    isGround: false,
    isPositiveVoltageSource: false,
  }
  input.pinStrongConnMap["X1.1-R1.2"] = true
  input.pinStrongConnMap["R1.2-X1.1"] = true
  input.pinStrongConnMap["X1.2-R2.2"] = true
  input.pinStrongConnMap["R2.2-X1.2"] = true
  input.netConnMap["R1.1-OSC_OUT_1"] = true
  input.netConnMap["R2.1-OSC_OUT_2"] = true

  const solver = new LayoutPipelineSolver(input)
  solver.solve()
  const layout = solver.getOutputLayout()

  expect(solver.checkForOverlaps(layout)).toEqual([])
  const r1 = layout.chipPlacements.R1!
  const r2 = layout.chipPlacements.R2!
  const gap = Math.max(input.decouplingCapsGap ?? 0, input.chipGap)
  const horizontalGap = Math.abs(r2.x - r1.x) - 0.6
  expect(horizontalGap).toBeCloseTo(gap * 2)
})
