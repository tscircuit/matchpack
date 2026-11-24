import { test, expect } from "bun:test"
import { IdentifyDecouplingCapsSolver } from "../../lib/solvers/IdentifyDecouplingCapsSolver/IdentifyDecouplingCapsSolver"
import type { InputProblem } from "../../lib/types/InputProblem"

const buildSourceIdProblem = (): InputProblem => ({
  chipMap: {
    source_component_0: {
      chipId: "source_component_0",
      pins: ["source_port_0", "source_port_1", "source_port_2"],
      size: { x: 2, y: 2 },
      availableRotations: [0],
    },
    source_component_1: {
      chipId: "source_component_1",
      pins: ["source_port_3", "source_port_4"],
      size: { x: 0.5, y: 1 },
      isCapacitor: true,
      availableRotations: [0, 180],
    },
  },
  chipPinMap: {
    source_port_0: {
      pinId: "source_port_0",
      offset: { x: -1, y: 0.5 },
      side: "x-",
    },
    source_port_1: {
      pinId: "source_port_1",
      offset: { x: -1, y: 0 },
      side: "x-",
    },
    source_port_2: {
      pinId: "source_port_2",
      offset: { x: -1, y: -0.5 },
      side: "x-",
    },
    source_port_3: {
      pinId: "source_port_3",
      offset: { x: 0, y: 0.3 },
      side: "y+",
    },
    source_port_4: {
      pinId: "source_port_4",
      offset: { x: 0, y: -0.3 },
      side: "y-",
    },
  },
  netMap: {
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
    GND: { netId: "GND", isGround: true },
  },
  pinStrongConnMap: {
    "source_port_3-source_port_0": true,
    "source_port_0-source_port_3": true,
  },
  netConnMap: {
    "source_port_0-VCC": true,
    "source_port_3-VCC": true,
    "source_port_4-GND": true,
  },
  chipGap: 0.2,
  partitionGap: 2,
})

test("IdentifyDecouplingCapsSolver resolves source pin ids to their owning chips", () => {
  const solver = new IdentifyDecouplingCapsSolver(buildSourceIdProblem())
  solver.solve()

  expect(solver.outputDecouplingCapGroups).toHaveLength(1)
  expect(solver.outputDecouplingCapGroups[0]).toMatchObject({
    mainChipId: "source_component_0",
    decouplingCapChipIds: ["source_component_1"],
  })
})
