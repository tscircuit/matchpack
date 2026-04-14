import { test, expect } from "bun:test"
import { PowerNetBiasSolver } from "../../lib/solvers/PowerNetBiasSolver/PowerNetBiasSolver"
import { LayoutPipelineSolver } from "../../lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { normalizeSide } from "lib/types/Side"
import type { InputProblem } from "lib/types/InputProblem"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import { getExampleCircuitJson } from "../assets/ExampleCircuit02"

/**
 * Build a synthetic problem with two chips: one connected purely to VCC,
 * one connected purely to GND. A third chip in the middle has equal connections
 * to both.
 */
function buildPowerGroundProblem(): InputProblem {
  return {
    chipMap: {
      VccChip: {
        chipId: "VccChip",
        pins: ["VccChip.1", "VccChip.2"],
        size: { x: 1.0, y: 0.5 },
      },
      GndChip: {
        chipId: "GndChip",
        pins: ["GndChip.1", "GndChip.2"],
        size: { x: 1.0, y: 0.5 },
      },
      MainChip: {
        chipId: "MainChip",
        pins: ["MainChip.1", "MainChip.2", "MainChip.3", "MainChip.4"],
        size: { x: 2.0, y: 2.0 },
      },
    },
    chipPinMap: {
      "VccChip.1": {
        pinId: "VccChip.1",
        offset: { x: -0.25, y: 0 },
        side: normalizeSide("left"),
      },
      "VccChip.2": {
        pinId: "VccChip.2",
        offset: { x: 0.25, y: 0 },
        side: normalizeSide("right"),
      },
      "GndChip.1": {
        pinId: "GndChip.1",
        offset: { x: -0.25, y: 0 },
        side: normalizeSide("left"),
      },
      "GndChip.2": {
        pinId: "GndChip.2",
        offset: { x: 0.25, y: 0 },
        side: normalizeSide("right"),
      },
      "MainChip.1": {
        pinId: "MainChip.1",
        offset: { x: -1.0, y: 0.5 },
        side: normalizeSide("left"),
      },
      "MainChip.2": {
        pinId: "MainChip.2",
        offset: { x: -1.0, y: -0.5 },
        side: normalizeSide("left"),
      },
      "MainChip.3": {
        pinId: "MainChip.3",
        offset: { x: 1.0, y: 0.5 },
        side: normalizeSide("right"),
      },
      "MainChip.4": {
        pinId: "MainChip.4",
        offset: { x: 1.0, y: -0.5 },
        side: normalizeSide("right"),
      },
    },
    netMap: {
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
      SIG: { netId: "SIG" },
    },
    pinStrongConnMap: {},
    netConnMap: {
      // VccChip: both pins on VCC
      "VccChip.1-VCC": true,
      "VccChip.2-VCC": true,
      // GndChip: both pins on GND
      "GndChip.1-GND": true,
      "GndChip.2-GND": true,
      // MainChip: one VCC, one GND, two signal pins
      "MainChip.1-VCC": true,
      "MainChip.2-GND": true,
      "MainChip.3-SIG": true,
      "MainChip.4-SIG": true,
    },
    chipGap: 0.5,
    partitionGap: 2,
  }
}

test("PowerNetBiasSolver moves power chip above ground chip", () => {
  const problem = buildPowerGroundProblem()

  // Start with a flat layout where all chips are at y=0
  const inputLayout = {
    chipPlacements: {
      VccChip: { x: -3, y: 0, ccwRotationDegrees: 0 },
      GndChip: { x: 3, y: 0, ccwRotationDegrees: 0 },
      MainChip: { x: 0, y: 0, ccwRotationDegrees: 0 },
    },
    groupPlacements: {},
  }

  const solver = new PowerNetBiasSolver({ inputProblem: problem, inputLayout })
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.outputLayout).not.toBeNull()

  const out = solver.outputLayout!

  // VccChip (100% VCC) must be above (higher Y in positive-Y-up coords) GndChip (100% GND)
  expect(out.chipPlacements["VccChip"]!.y).toBeGreaterThan(
    out.chipPlacements["GndChip"]!.y,
  )

  // VccChip should have moved upward from y=0 (positive Y = up)
  expect(out.chipPlacements["VccChip"]!.y).toBeGreaterThan(0)

  // GndChip should have moved downward from y=0 (negative Y = down)
  expect(out.chipPlacements["GndChip"]!.y).toBeLessThan(0)
})

test("PowerNetBiasSolver resolves overlaps after bias", () => {
  const problem = buildPowerGroundProblem()

  // Start with chips stacked at the same position
  const inputLayout = {
    chipPlacements: {
      VccChip: { x: 0, y: 0, ccwRotationDegrees: 0 },
      GndChip: { x: 0, y: 0, ccwRotationDegrees: 0 },
      MainChip: { x: 0, y: 0, ccwRotationDegrees: 0 },
    },
    groupPlacements: {},
  }

  const solver = new PowerNetBiasSolver({ inputProblem: problem, inputLayout })
  solver.solve()

  expect(solver.solved).toBe(true)
  const out = solver.outputLayout!

  // Check no chips overlap each other
  const chipIds = Object.keys(out.chipPlacements)
  for (let i = 0; i < chipIds.length; i++) {
    for (let j = i + 1; j < chipIds.length; j++) {
      const id1 = chipIds[i]!
      const id2 = chipIds[j]!
      const p1 = out.chipPlacements[id1]!
      const p2 = out.chipPlacements[id2]!
      const chip1 = problem.chipMap[id1]!
      const chip2 = problem.chipMap[id2]!

      const dx = Math.abs(p1.x - p2.x)
      const dy = Math.abs(p1.y - p2.y)
      const minDx = (chip1.size.x + chip2.size.x) / 2
      const minDy = (chip1.size.y + chip2.size.y) / 2

      // Chips must be separated in at least one axis
      const separated = dx >= minDx - 1e-6 || dy >= minDy - 1e-6
      expect(separated).toBe(true)
    }
  }
})

test("PowerNetBiasSolver: power chip ends up above signal chip above ground chip in full pipeline", () => {
  const problem = buildPowerGroundProblem()
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.powerNetBiasSolver?.solved).toBe(true)

  const layout = solver.getOutputLayout()

  const vccY = layout.chipPlacements["VccChip"]!.y
  const gndY = layout.chipPlacements["GndChip"]!.y

  // After the full pipeline + bias, VccChip must be strictly above GndChip
  // (positive Y = up in schematic coordinates)
  expect(vccY).toBeGreaterThan(gndY)
})

test("PowerNetBiasSolver does not break ExampleCircuit02 pipeline", () => {
  const circuitJson = getExampleCircuitJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.powerNetBiasSolver?.solved).toBe(true)

  const layout = solver.getOutputLayout()

  // All chips should have placements
  for (const chipId of Object.keys(problem.chipMap)) {
    expect(layout.chipPlacements[chipId]).toBeDefined()
    const p = layout.chipPlacements[chipId]!
    expect(typeof p.x).toBe("number")
    expect(typeof p.y).toBe("number")
    expect(isNaN(p.x)).toBe(false)
    expect(isNaN(p.y)).toBe(false)
  }

  // GND net exists — any chip connected purely to GND should be below any chip
  // connected purely to a positive voltage net
  const gndChips: string[] = []
  const vccChips: string[] = []

  for (const [chipId, chip] of Object.entries(problem.chipMap)) {
    let powerPins = 0
    let groundPins = 0
    const total = chip.pins.length
    for (const pinId of chip.pins) {
      for (const [connKey, connected] of Object.entries(problem.netConnMap)) {
        if (!connected) continue
        const sep = connKey.indexOf("-")
        const cPinId = connKey.slice(0, sep)
        const netId = connKey.slice(sep + 1)
        if (cPinId !== pinId) continue
        const net = problem.netMap[netId]
        if (!net) continue
        if (net.isPositiveVoltageSource) powerPins++
        if (net.isGround) groundPins++
      }
    }
    if (total > 0) {
      if (groundPins / total >= 0.9) gndChips.push(chipId)
      if (powerPins / total >= 0.9) vccChips.push(chipId)
    }
  }

  // If we found clear power/ground chips, verify ordering
  // (positive Y = up: power chips must have higher Y than ground chips)
  for (const vChip of vccChips) {
    for (const gChip of gndChips) {
      expect(layout.chipPlacements[vChip]!.y).toBeGreaterThan(
        layout.chipPlacements[gChip]!.y,
      )
    }
  }
})
