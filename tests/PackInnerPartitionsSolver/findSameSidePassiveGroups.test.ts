import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { findSameSidePassiveGroups } from "lib/solvers/PackInnerPartitionsSolver/findSameSidePassiveGroups"
import type { InputProblem } from "lib/types/InputProblem"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"
import si7021Input from "../../pages/repros/repro-si7021/si7021-matchpack-input.json"
import commonNodeInput from "../assets/repro-core-repro70-common-node-placement.input.json"

const makeRailCarrierProblem = (
  opts: {
    customIds?: boolean
    differentCarriers?: boolean
    ambiguousCarrierBranch?: boolean
    multipleRailPins?: boolean
    fixedCarrier?: boolean
    fixedPassive?: boolean
  } = {},
): InputProblem => {
  const main = opts.customIds ? "sensor_controller" : "U1"
  const upperPassive = opts.customIds ? "pullup_upper" : "R1"
  const lowerPassive = opts.customIds ? "pullup_lower" : "R2"
  const carrierA = opts.customIds ? "selectable_bridge_a" : "SJ1"
  const carrierB = opts.customIds ? "selectable_bridge_b" : "SJ2"
  const lowerCarrier = opts.differentCarriers ? carrierB : carrierA
  const carrierPins =
    opts.ambiguousCarrierBranch || opts.multipleRailPins
      ? [`${carrierA}.1`, `${carrierA}.2`, `${carrierA}.3`, `${carrierA}.4`]
      : [`${carrierA}.1`, `${carrierA}.2`, `${carrierA}.3`]

  return {
    chipMap: {
      [main]: {
        chipId: main,
        pins: [`${main}.1`, `${main}.2`, `${main}.3`, `${main}.4`],
        size: { x: 1.2, y: 0.8 },
        availableRotations: [0, 90, 180, 270],
      },
      [upperPassive]: {
        chipId: upperPassive,
        pins: [`${upperPassive}.1`, `${upperPassive}.2`],
        size: { x: 0.5, y: 1 },
        availableRotations: [0, 90, 180, 270],
        ...(opts.fixedPassive && { fixedPosition: { x: 2, y: 1 } }),
      },
      [lowerPassive]: {
        chipId: lowerPassive,
        pins: [`${lowerPassive}.1`, `${lowerPassive}.2`],
        size: { x: 0.5, y: 1 },
        availableRotations: [0, 90, 180, 270],
      },
      [carrierA]: {
        chipId: carrierA,
        pins: carrierPins,
        size: { x: 0.6, y: 0.6 },
        availableRotations: [0, 90, 180, 270],
        ...(opts.fixedCarrier && { fixedPosition: { x: 3, y: 0 } }),
      },
      ...(opts.differentCarriers && {
        [carrierB]: {
          chipId: carrierB,
          pins: [`${carrierB}.1`, `${carrierB}.2`, `${carrierB}.3`],
          size: { x: 0.6, y: 0.6 },
          availableRotations: [0, 90, 180, 270],
        },
      }),
      ...(opts.ambiguousCarrierBranch && {
        branch_load: {
          chipId: "branch_load",
          pins: ["branch_load.1", "branch_load.2"],
          size: { x: 0.5, y: 1 },
          availableRotations: [0, 90, 180, 270],
        },
      }),
    },
    chipPinMap: {
      [`${main}.1`]: {
        pinId: `${main}.1`,
        side: "x-",
        offset: { x: -1, y: 0.2 },
      },
      [`${main}.2`]: {
        pinId: `${main}.2`,
        side: "x-",
        offset: { x: -1, y: 0 },
      },
      [`${main}.3`]: {
        pinId: `${main}.3`,
        side: "x+",
        offset: { x: 1, y: -0.2 },
      },
      [`${main}.4`]: {
        pinId: `${main}.4`,
        side: "x+",
        offset: { x: 1, y: 0.2 },
      },
      [`${upperPassive}.1`]: {
        pinId: `${upperPassive}.1`,
        side: "y+",
        offset: { x: 0, y: 0.5 },
      },
      [`${upperPassive}.2`]: {
        pinId: `${upperPassive}.2`,
        side: "y-",
        offset: { x: 0, y: -0.5 },
      },
      [`${lowerPassive}.1`]: {
        pinId: `${lowerPassive}.1`,
        side: "y+",
        offset: { x: 0, y: 0.5 },
      },
      [`${lowerPassive}.2`]: {
        pinId: `${lowerPassive}.2`,
        side: "y-",
        offset: { x: 0, y: -0.5 },
      },
      [`${carrierA}.1`]: {
        pinId: `${carrierA}.1`,
        side: "x-",
        offset: { x: -0.3, y: 0 },
      },
      [`${carrierA}.2`]: {
        pinId: `${carrierA}.2`,
        side: "y+",
        offset: { x: 0, y: 0.3 },
      },
      [`${carrierA}.3`]: {
        pinId: `${carrierA}.3`,
        side: "x+",
        offset: { x: 0.3, y: 0 },
      },
      ...(carrierPins.includes(`${carrierA}.4`) && {
        [`${carrierA}.4`]: {
          pinId: `${carrierA}.4`,
          side: "y-",
          offset: { x: 0, y: -0.3 },
        },
      }),
      ...(opts.differentCarriers && {
        [`${carrierB}.1`]: {
          pinId: `${carrierB}.1`,
          side: "x-",
          offset: { x: -0.3, y: 0 },
        },
        [`${carrierB}.2`]: {
          pinId: `${carrierB}.2`,
          side: "y+",
          offset: { x: 0, y: 0.3 },
        },
        [`${carrierB}.3`]: {
          pinId: `${carrierB}.3`,
          side: "x+",
          offset: { x: 0.3, y: 0 },
        },
      }),
      ...(opts.ambiguousCarrierBranch && {
        "branch_load.1": {
          pinId: "branch_load.1",
          side: "y+",
          offset: { x: 0, y: 0.5 },
        },
        "branch_load.2": {
          pinId: "branch_load.2",
          side: "y-",
          offset: { x: 0, y: -0.5 },
        },
      }),
    },
    netMap: {
      RAIL: { netId: "RAIL" },
      ...(opts.multipleRailPins && { OTHER_RAIL: { netId: "OTHER_RAIL" } }),
    },
    pinStrongConnMap: {
      [`${main}.4-${upperPassive}.1`]: true,
      [`${main}.3-${lowerPassive}.1`]: true,
      [`${upperPassive}.2-${carrierA}.3`]: true,
      [`${lowerPassive}.2-${lowerCarrier}.1`]: true,
      ...(opts.ambiguousCarrierBranch && {
        [`${carrierA}.4-branch_load.1`]: true,
      }),
    },
    netConnMap: {
      [`${carrierA}.2-RAIL`]: true,
      ...(opts.differentCarriers && { [`${carrierB}.2-RAIL`]: true }),
      ...(opts.multipleRailPins && { [`${carrierA}.4-OTHER_RAIL`]: true }),
    },
    chipGap: 0.4,
    partitionGap: 1.2,
  }
}

const getStrongEdgeMetrics = (inputProblem: InputProblem) => {
  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()
  const layout = solver.getOutputLayout()
  const pinToChip = new Map<string, string>()
  for (const [chipId, chip] of Object.entries(inputProblem.chipMap)) {
    for (const pinId of chip.pins) pinToChip.set(pinId, chipId)
  }

  const edges = Object.keys(inputProblem.pinStrongConnMap)
    .map((connKey) => connKey.split("-") as [string, string])
    .filter(
      ([a, b]) => inputProblem.chipPinMap[a] && inputProblem.chipPinMap[b],
    )
    .map(([a, b]) => {
      const chipA = pinToChip.get(a)!
      const chipB = pinToChip.get(b)!
      const placementA = layout.chipPlacements[chipA]!
      const placementB = layout.chipPlacements[chipB]!
      const offsetA = rotatePinOffset(
        inputProblem.chipPinMap[a]!.offset,
        placementA.ccwRotationDegrees,
      )
      const offsetB = rotatePinOffset(
        inputProblem.chipPinMap[b]!.offset,
        placementB.ccwRotationDegrees,
      )
      const dx = placementB.x + offsetB.x - (placementA.x + offsetA.x)
      const dy = placementB.y + offsetB.y - (placementA.y + offsetA.y)
      return {
        edge: `${a}-${b}`,
        manhattan: Math.abs(dx) + Math.abs(dy),
        offAxis: Math.min(Math.abs(dx), Math.abs(dy)),
      }
    })

  return {
    solver,
    edges,
    totalManhattan: edges.reduce((sum, edge) => sum + edge.manhattan, 0),
    maxOffAxis: Math.max(...edges.map((edge) => edge.offAxis)),
  }
}

test("detects the original SI7021 passive rail-carrier topology", () => {
  const groups = findSameSidePassiveGroups(si7021Input as InputProblem)

  expect(groups).toHaveLength(1)
  expect(groups[0]!.railCarrier?.carrierChipId).toBe("SJ1")
  expect(groups[0]!.passiveChipIds).toEqual(["R2", "R1"])
})

test("lays out SI7021 rail-carrier passives with materially lower off-axis error", () => {
  const { solver, totalManhattan, maxOffAxis } = getStrongEdgeMetrics(
    si7021Input as InputProblem,
  )

  expect(
    solver.packInnerPartitionsSolver?.completedSolvers[0]?.constructor.name,
  ).toBe("ParallelAlignedPassiveSolver")
  expect(solver.checkForOverlaps(solver.getOutputLayout())).toHaveLength(0)
  expect(totalManhattan).toBeLessThan(5.9)
  expect(maxOffAxis).toBeLessThanOrEqual(0.125)
})

test("detects rail-carrier topology with arbitrary component ids", () => {
  const groups = findSameSidePassiveGroups(
    makeRailCarrierProblem({ customIds: true }),
  )

  expect(groups).toHaveLength(1)
  expect(groups[0]!.railCarrier?.carrierChipId).toBe("selectable_bridge_a")
  expect(groups[0]!.passiveChipIds).toEqual(["pullup_lower", "pullup_upper"])
})

test("declines same-side passives attached to unrelated downstream parts", () => {
  expect(
    findSameSidePassiveGroups(
      makeRailCarrierProblem({ differentCarriers: true }),
    ),
  ).toHaveLength(0)
})

test("declines a shared carrier with an extra branch", () => {
  expect(
    findSameSidePassiveGroups(
      makeRailCarrierProblem({ ambiguousCarrierBranch: true }),
    ),
  ).toHaveLength(0)
})

test("declines a shared carrier with multiple possible rail pins", () => {
  expect(
    findSameSidePassiveGroups(
      makeRailCarrierProblem({ multipleRailPins: true }),
    ),
  ).toHaveLength(0)
})

test("declines rail-carrier topology when the carrier is fixed", () => {
  expect(
    findSameSidePassiveGroups(makeRailCarrierProblem({ fixedCarrier: true })),
  ).toHaveLength(0)
})

test("declines rail-carrier topology when a passive is fixed", () => {
  expect(
    findSameSidePassiveGroups(makeRailCarrierProblem({ fixedPassive: true })),
  ).toHaveLength(0)
})

test("preserves existing common-node passive detection", () => {
  const groups = findSameSidePassiveGroups(commonNodeInput as InputProblem)

  expect(groups).toHaveLength(1)
  expect(groups[0]!.railCarrier).toBeUndefined()
  expect(groups[0]!.passiveChipIds).toEqual(["C1", "C3"])
})

test("preserves existing three-passive same-side detection", () => {
  const problem = makeRailCarrierProblem()
  problem.chipMap.C3 = {
    chipId: "C3",
    pins: ["C3.1", "C3.2"],
    size: { x: 0.5, y: 1 },
    availableRotations: [0, 90, 180, 270],
  }
  problem.chipMap.U1!.pins.push("U1.5")
  problem.chipPinMap["U1.5"] = {
    pinId: "U1.5",
    side: "x+",
    offset: { x: 1, y: 0.6 },
  }
  problem.chipPinMap["C3.1"] = {
    pinId: "C3.1",
    side: "y+",
    offset: { x: 0, y: 0.5 },
  }
  problem.chipPinMap["C3.2"] = {
    pinId: "C3.2",
    side: "y-",
    offset: { x: 0, y: -0.5 },
  }
  problem.pinStrongConnMap = {
    "U1.4-R1.1": true,
    "U1.3-R2.1": true,
    "U1.5-C3.1": true,
  }
  problem.netConnMap = {
    "R1.2-SHARED": true,
    "R2.2-SHARED": true,
    "C3.2-SHARED": true,
  }
  problem.netMap = { SHARED: { netId: "SHARED" } }

  const groups = findSameSidePassiveGroups(problem)

  expect(groups).toHaveLength(1)
  expect(groups[0]!.railCarrier).toBeUndefined()
  expect(groups[0]!.passiveChipIds).toEqual(["R2", "R1", "C3"])
})
