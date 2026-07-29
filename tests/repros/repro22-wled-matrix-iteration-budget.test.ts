import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem, PinId } from "lib/types/InputProblem"

const LED_COUNT = 12 * 12

const createWledMatrixProblem = (): InputProblem => {
  const problem: InputProblem = {
    chipMap: {},
    chipPinMap: {},
    netMap: {
      V5: { netId: "V5", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.6,
    decouplingCapsGap: 0.4,
    partitionGap: 1.2,
  }

  const connectPins = (firstPinId: PinId, secondPinId: PinId) => {
    problem.pinStrongConnMap[`${firstPinId}-${secondPinId}`] = true
    problem.pinStrongConnMap[`${secondPinId}-${firstPinId}`] = true
  }

  const u1PinIds = Array.from({ length: 14 }, (_, pinIndex) => {
    const pinNumber = pinIndex + 1
    const pinId = `U1.${pinNumber}`
    const isLeftSide = pinNumber <= 7
    const sidePinIndex = isLeftSide ? pinIndex : pinIndex - 7
    problem.chipPinMap[pinId] = {
      pinId,
      offset: {
        x: isLeftSide ? -1.45 : 1.45,
        y: (isLeftSide ? 3 - sidePinIndex : sidePinIndex - 3) * 0.2,
      },
      side: isLeftSide ? "x-" : "x+",
    }
    return pinId
  })
  problem.chipMap.U1 = {
    chipId: "U1",
    pins: u1PinIds,
    size: { x: 2.1, y: 2.4 },
    availableRotations: [0],
  }

  problem.chipMap.RDATA = {
    chipId: "RDATA",
    pins: ["RDATA.1", "RDATA.2"],
    size: { x: 0.6, y: 0.68 },
    isResistor: true,
    availableRotations: [0, 90, 180, 270],
  }
  problem.chipPinMap["RDATA.1"] = {
    pinId: "RDATA.1",
    offset: { x: -0.3, y: 0 },
    side: "x-",
  }
  problem.chipPinMap["RDATA.2"] = {
    pinId: "RDATA.2",
    offset: { x: 0.3, y: 0 },
    side: "x+",
  }

  connectPins("U1.5", "RDATA.1")

  for (let ledIndex = 0; ledIndex < LED_COUNT; ledIndex++) {
    const chipId = `D${ledIndex + 1}`
    const pinIds = [1, 2, 3, 4].map((pinNumber) => `${chipId}.${pinNumber}`)
    problem.chipMap[chipId] = {
      chipId,
      pins: pinIds,
      size: { x: 1.2, y: 1.4 },
      availableRotations: [0],
    }
    problem.chipPinMap[`${chipId}.1`] = {
      pinId: `${chipId}.1`,
      offset: { x: -1, y: 0.1 },
      side: "x-",
    }
    problem.chipPinMap[`${chipId}.2`] = {
      pinId: `${chipId}.2`,
      offset: { x: -1, y: -0.1 },
      side: "x-",
    }
    problem.chipPinMap[`${chipId}.3`] = {
      pinId: `${chipId}.3`,
      offset: { x: 1, y: -0.1 },
      side: "x+",
    }
    problem.chipPinMap[`${chipId}.4`] = {
      pinId: `${chipId}.4`,
      offset: { x: 1, y: 0.1 },
      side: "x+",
    }
    problem.netConnMap[`${chipId}.1-V5`] = true
    problem.netConnMap[`${chipId}.3-GND`] = true

    if (ledIndex === 0) {
      connectPins("RDATA.2", `${chipId}.4`)
    } else {
      connectPins(`D${ledIndex}.2`, `${chipId}.4`)
    }
  }

  problem.netConnMap["U1.14-V5"] = true
  problem.netConnMap["U1.13-GND"] = true

  return problem
}

test("large WLED chain completes Matchpack layout without exhausting iterations", () => {
  const problem = createWledMatrixProblem()
  const solver = new LayoutPipelineSolver(problem)

  solver.solve()

  expect(solver.failed).toBeFalse()
  expect(solver.solved).toBeTrue()
  const innerPartitionSolver =
    solver.packInnerPartitionsSolver!.completedSolvers[0]!
  expect(innerPartitionSolver.iterations).toBeLessThanOrEqual(
    innerPartitionSolver.MAX_ITERATIONS,
  )
  const outputLayout = solver.getOutputLayout()
  expect(Object.keys(outputLayout.chipPlacements)).toHaveLength(LED_COUNT + 2)
  expect(solver.checkForOverlaps(outputLayout)).toEqual([])
}, 30_000)
