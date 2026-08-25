import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { ParallelAlignedPassiveSolver } from "lib/solvers/PackInnerPartitionsSolver/ParallelAlignedPassiveSolver"
import { findSameSidePassiveGroups } from "lib/solvers/PackInnerPartitionsSolver/findSameSidePassiveGroups"
import type { OutputLayout, Placement } from "lib/types/OutputLayout"
import type { ChipPin, InputProblem } from "lib/types/InputProblem"
import { getRotatedSize, rotatePinOffset } from "lib/utils/rotatePinOffset"
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
    fixedMain?: boolean
    fixedMainPosition?: { x: number; y: number }
    fixedMainRotation?: 0 | 90 | 180 | 270
    branchedMainFacingPin?: boolean
    branchedCarrierFacingPin?: boolean
    customNet?: boolean
  } = {},
): InputProblem => {
  const main = opts.customIds ? "sensor_controller" : "U1"
  const upperPassive = opts.customIds ? "pullup_upper" : "R1"
  const lowerPassive = opts.customIds ? "pullup_lower" : "R2"
  const carrierA = opts.customIds ? "selectable_bridge_a" : "SJ1"
  const carrierB = opts.customIds ? "selectable_bridge_b" : "SJ2"
  const railNet = opts.customNet ? "pullup_bus" : "RAIL"
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
        availableRotations:
          opts.fixedMainRotation !== undefined
            ? [opts.fixedMainRotation]
            : [0, 90, 180, 270],
        ...(opts.fixedMain && {
          fixedPosition: opts.fixedMainPosition ?? { x: 0, y: 0 },
        }),
      },
      [upperPassive]: {
        chipId: upperPassive,
        pins: [`${upperPassive}.1`, `${upperPassive}.2`],
        size: { x: 0.5, y: 1 },
        availableRotations: [0, 90, 180, 270],
        isResistor: true,
        ...(opts.fixedPassive && { fixedPosition: { x: 2, y: 1 } }),
      },
      [lowerPassive]: {
        chipId: lowerPassive,
        pins: [`${lowerPassive}.1`, `${lowerPassive}.2`],
        size: { x: 0.5, y: 1 },
        availableRotations: [0, 90, 180, 270],
        isResistor: true,
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
      ...((opts.ambiguousCarrierBranch ||
        opts.branchedMainFacingPin ||
        opts.branchedCarrierFacingPin) && {
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
      ...((opts.ambiguousCarrierBranch ||
        opts.branchedMainFacingPin ||
        opts.branchedCarrierFacingPin) && {
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
      [railNet]: { netId: railNet },
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
      ...(opts.branchedMainFacingPin && {
        [`${upperPassive}.1-branch_load.1`]: true,
      }),
      ...(opts.branchedCarrierFacingPin && {
        [`${upperPassive}.2-branch_load.1`]: true,
      }),
    },
    netConnMap: {
      [`${carrierA}.2-${railNet}`]: true,
      ...(opts.differentCarriers && { [`${carrierB}.2-${railNet}`]: true }),
      ...(opts.multipleRailPins && { [`${carrierA}.4-OTHER_RAIL`]: true }),
    },
    chipGap: 0.4,
    partitionGap: 1.2,
  }
}

const makeMultiPassiveRailCarrierProblem = (
  opts: {
    passiveCount?: number
    extraBranch?: boolean
    multipleRailPins?: boolean
    extraCarrierPin?: boolean
    diodeLikeFirstPassive?: boolean
    untypedFirstPassive?: boolean
    transistorLikeFirstPassive?: boolean
    largeCarrierLike?: boolean
  } = {},
): InputProblem => {
  const passiveCount = opts.passiveCount ?? 4
  const mainPins = Array.from({ length: Math.max(passiveCount, 4) }, (_, i) => {
    return `Uwide.${i + 1}`
  })
  const passiveIds = Array.from({ length: passiveCount }, (_, i) => {
    if (i === 0 && opts.diodeLikeFirstPassive) return "Dprotect"
    if (i === 0 && opts.untypedFirstPassive) return "leaf"
    if (i === 0 && opts.transistorLikeFirstPassive) return "Q1"
    return `R${i + 1}`
  })
  const carrierPassivePins = passiveIds.map((_, i) => `Jwide.${i + 1}`)
  const railPins = opts.multipleRailPins
    ? ["Jwide.RAIL1", "Jwide.RAIL2"]
    : ["Jwide.RAIL"]
  const extraCarrierPins = [
    ...(opts.extraBranch ? ["Jwide.BRANCH"] : []),
    ...(opts.extraCarrierPin ? ["Jwide.NC"] : []),
    ...(opts.largeCarrierLike
      ? Array.from({ length: 12 }, (_, i) => `Jwide.EXTRA${i + 1}`)
      : []),
  ]
  const carrierPins = [...carrierPassivePins, ...railPins, ...extraCarrierPins]
  const chipMap: InputProblem["chipMap"] = {
    Uwide: {
      chipId: "Uwide",
      pins: mainPins,
      size: { x: 1.6, y: 1.6 },
      availableRotations: [0, 90, 180, 270],
    },
    Jwide: {
      chipId: "Jwide",
      pins: carrierPins,
      size: { x: 0.8, y: 0.8 },
      availableRotations: [0, 90, 180, 270],
    },
  }
  const chipPinMap: InputProblem["chipPinMap"] = {}
  const pinStrongConnMap: InputProblem["pinStrongConnMap"] = {}
  const netConnMap: InputProblem["netConnMap"] = {}

  for (const [index, pinId] of mainPins.entries()) {
    chipPinMap[pinId] = {
      pinId,
      side: "x+",
      offset: { x: 1, y: index * 0.35 - passiveCount * 0.175 },
    }
  }
  for (const [index, passiveId] of passiveIds.entries()) {
    const firstPassiveHasUnsupportedType =
      index === 0 &&
      (opts.diodeLikeFirstPassive ||
        opts.untypedFirstPassive ||
        opts.transistorLikeFirstPassive)
    const passivePins =
      opts.transistorLikeFirstPassive && index === 0
        ? [`${passiveId}.1`, `${passiveId}.2`, `${passiveId}.3`]
        : [`${passiveId}.1`, `${passiveId}.2`]
    chipMap[passiveId] = {
      chipId: passiveId,
      pins: passivePins,
      size: { x: 0.5, y: 1 },
      availableRotations: [0, 90, 180, 270],
      ...(!firstPassiveHasUnsupportedType && { isResistor: true }),
    }
    chipPinMap[`${passiveId}.1`] = {
      pinId: `${passiveId}.1`,
      side: "y+",
      offset: { x: 0, y: 0.5 },
    }
    chipPinMap[`${passiveId}.2`] = {
      pinId: `${passiveId}.2`,
      side: "y-",
      offset: { x: 0, y: -0.5 },
    }
    if (passivePins.length === 3) {
      chipPinMap[`${passiveId}.3`] = {
        pinId: `${passiveId}.3`,
        side: "x+",
        offset: { x: 0.25, y: 0 },
      }
    }
    pinStrongConnMap[`Uwide.${index + 1}-${passiveId}.1`] = true
    pinStrongConnMap[`${passiveId}.2-Jwide.${index + 1}`] = true
  }

  for (const [index, pinId] of carrierPins.entries()) {
    chipPinMap[pinId] = {
      pinId,
      side: pinId.includes("RAIL") ? "y+" : "x-",
      offset: {
        x: pinId.includes("RAIL") ? 0 : -0.4,
        y: index * 0.2 - carrierPins.length * 0.1,
      },
    }
  }
  for (const [index, railPinId] of railPins.entries()) {
    netConnMap[`${railPinId}-RAIL${index || ""}`] = true
  }
  if (opts.extraBranch) {
    chipMap.branch_load = {
      chipId: "branch_load",
      pins: ["branch_load.1", "branch_load.2"],
      size: { x: 0.5, y: 1 },
      availableRotations: [0, 90, 180, 270],
    }
    chipPinMap["branch_load.1"] = {
      pinId: "branch_load.1",
      side: "y+",
      offset: { x: 0, y: 0.5 },
    }
    chipPinMap["branch_load.2"] = {
      pinId: "branch_load.2",
      side: "y-",
      offset: { x: 0, y: -0.5 },
    }
    pinStrongConnMap["Jwide.BRANCH-branch_load.1"] = true
  }

  return {
    chipMap,
    chipPinMap,
    netMap: {
      RAIL: { netId: "RAIL" },
      ...(opts.multipleRailPins && { RAIL1: { netId: "RAIL1" } }),
    },
    pinStrongConnMap,
    netConnMap,
    chipGap: 0.4,
    partitionGap: 1.2,
  }
}

const makeMirroredRailCarrierProblem = (): InputProblem => {
  const problem = makeRailCarrierProblem()
  problem.chipMap.A = {
    chipId: "A",
    pins: ["A.1", "A.2", "A.3", "A.4"],
    size: { x: 1.2, y: 1.2 },
    availableRotations: [0, 90, 180, 270],
  }
  problem.chipMap.B = {
    chipId: "B",
    pins: ["B.1", "B.2", "B.3", "B.4"],
    size: { x: 1.2, y: 1.2 },
    availableRotations: [0, 90, 180, 270],
  }
  delete problem.chipMap.U1
  delete problem.chipMap.SJ1
  problem.chipMap.R3 = {
    chipId: "R3",
    pins: ["R3.1", "R3.2"],
    size: { x: 0.5, y: 1 },
    availableRotations: [0, 90, 180, 270],
    isResistor: true,
  }
  problem.chipPinMap = {
    "A.1": { pinId: "A.1", side: "x+", offset: { x: 0.6, y: -0.3 } },
    "A.2": { pinId: "A.2", side: "x+", offset: { x: 0.6, y: 0 } },
    "A.3": { pinId: "A.3", side: "y+", offset: { x: 0, y: 0.6 } },
    "A.4": { pinId: "A.4", side: "x+", offset: { x: 0.6, y: 0.3 } },
    "B.1": { pinId: "B.1", side: "x-", offset: { x: -0.6, y: -0.3 } },
    "B.2": { pinId: "B.2", side: "x-", offset: { x: -0.6, y: 0 } },
    "B.3": { pinId: "B.3", side: "y+", offset: { x: 0, y: 0.6 } },
    "B.4": { pinId: "B.4", side: "x-", offset: { x: -0.6, y: 0.3 } },
    "R1.1": { pinId: "R1.1", side: "y+", offset: { x: 0, y: 0.5 } },
    "R1.2": { pinId: "R1.2", side: "y-", offset: { x: 0, y: -0.5 } },
    "R2.1": { pinId: "R2.1", side: "y+", offset: { x: 0, y: 0.5 } },
    "R2.2": { pinId: "R2.2", side: "y-", offset: { x: 0, y: -0.5 } },
    "R3.1": { pinId: "R3.1", side: "y+", offset: { x: 0, y: 0.5 } },
    "R3.2": { pinId: "R3.2", side: "y-", offset: { x: 0, y: -0.5 } },
  }
  problem.netMap = {
    A_RAIL: { netId: "A_RAIL" },
    B_RAIL: { netId: "B_RAIL" },
  }
  problem.pinStrongConnMap = {
    "A.1-R1.1": true,
    "A.2-R2.1": true,
    "A.4-R3.1": true,
    "R1.2-B.1": true,
    "R2.2-B.2": true,
    "R3.2-B.4": true,
  }
  problem.netConnMap = {
    "A.3-A_RAIL": true,
    "B.3-B_RAIL": true,
  }
  return problem
}

const makeDenseRailCarrierGapProblem = (): InputProblem => {
  const problem = makeRailCarrierProblem()
  problem.chipGap = 0.5
  problem.chipPinMap["U1.3"] = {
    pinId: "U1.3",
    side: "x+",
    offset: { x: 1, y: -0.025 },
  }
  problem.chipPinMap["U1.4"] = {
    pinId: "U1.4",
    side: "x+",
    offset: { x: 1, y: 0.025 },
  }
  return problem
}

const getRailCarrierGroups = (inputProblem: InputProblem) =>
  findSameSidePassiveGroups(inputProblem).filter((group) => group.railCarrier)

const replaceStrongConnection = (
  inputProblem: InputProblem,
  from: `${string}-${string}`,
  to: `${string}-${string}`,
): void => {
  delete inputProblem.pinStrongConnMap[from]
  inputProblem.pinStrongConnMap[to] = true
}

const makeRailCarrierContractProblem = (
  mutate?: (inputProblem: InputProblem) => void,
): InputProblem => {
  const inputProblem = makeMultiPassiveRailCarrierProblem({ passiveCount: 3 })
  mutate?.(inputProblem)
  return inputProblem
}

const reorderRecord = <T>(record: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).reverse())

const makeRotatedPackedMainRailCarrierProblem = (): InputProblem => {
  const passiveIds = ["R1", "R2", "R3", "R4"]
  const chipMap: InputProblem["chipMap"] = {
    A: {
      chipId: "A",
      pins: ["A.1", "A.2", "A.3", "A.4"],
      size: { x: 0.8, y: 2.4 },
      availableRotations: [0, 90, 180, 270],
    },
    B: {
      chipId: "B",
      pins: ["B.1", "B.2", "B.3", "B.4", "B.RAIL"],
      size: { x: 0.8, y: 2.4 },
      availableRotations: [0, 90],
    },
  }
  for (const passiveId of passiveIds) {
    chipMap[passiveId] = {
      chipId: passiveId,
      pins: [`${passiveId}.1`, `${passiveId}.2`],
      size: { x: 0.5, y: 1 },
      availableRotations: [0, 90, 180, 270],
      isResistor: true,
    }
  }

  const chipPinMap: InputProblem["chipPinMap"] = {
    "B.RAIL": { pinId: "B.RAIL", side: "y+", offset: { x: 0, y: 1.2 } },
  }
  for (const [index, pinId] of ["A.1", "A.2", "A.3", "A.4"].entries()) {
    chipPinMap[pinId] = {
      pinId,
      side: "y+",
      offset: { x: (index - 1.5) * 0.2, y: 1.2 },
    }
  }
  for (const [index, pinId] of ["B.1", "B.2", "B.3", "B.4"].entries()) {
    chipPinMap[pinId] = {
      pinId,
      side: "x-",
      offset: { x: -0.4, y: (index - 1.5) * 0.3 },
    }
  }
  for (const passiveId of passiveIds) {
    chipPinMap[`${passiveId}.1`] = {
      pinId: `${passiveId}.1`,
      side: "y+",
      offset: { x: 0, y: 0.5 },
    }
    chipPinMap[`${passiveId}.2`] = {
      pinId: `${passiveId}.2`,
      side: "y-",
      offset: { x: 0, y: -0.5 },
    }
  }

  return {
    chipMap,
    chipPinMap,
    netMap: { RAIL: { netId: "RAIL" } },
    pinStrongConnMap: Object.fromEntries(
      passiveIds.flatMap((passiveId, index) => [
        [`A.${index + 1}-${passiveId}.1`, true],
        [`${passiveId}.2-B.${index + 1}`, true],
      ]),
    ),
    netConnMap: { "B.RAIL-RAIL": true },
    chipGap: 0.4,
    partitionGap: 1.2,
  }
}

type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

const getChipBounds = (
  inputProblem: InputProblem,
  chipId: string,
  placement: Placement,
): Bounds => {
  const chip = inputProblem.chipMap[chipId]!
  const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
  const points = [
    { x: placement.x - size.x / 2, y: placement.y - size.y / 2 },
    { x: placement.x + size.x / 2, y: placement.y + size.y / 2 },
  ]
  for (const pinId of chip.pins) {
    const pin = inputProblem.chipPinMap[pinId]
    if (!pin) continue
    const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
    points.push({ x: placement.x + offset.x, y: placement.y + offset.y })
  }
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  }
}

const getBoundsDistance = (a: Bounds, b: Bounds): number => {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX)
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY)
  return Math.hypot(dx, dy)
}

const getConnectedPinsByPinId = (
  inputProblem: InputProblem,
): Record<string, ChipPin[]> => {
  const connectedPinsByPinId: Record<string, ChipPin[]> = {}
  for (const [connKey, connected] of Object.entries(
    inputProblem.pinStrongConnMap,
  )) {
    if (!connected) continue
    const [a, b] = connKey.split("-")
    const pinA = a && inputProblem.chipPinMap[a]
    const pinB = b && inputProblem.chipPinMap[b]
    if (!a || !b || !pinA || !pinB) continue
    connectedPinsByPinId[a] = [...(connectedPinsByPinId[a] ?? []), pinB]
    connectedPinsByPinId[b] = [...(connectedPinsByPinId[b] ?? []), pinA]
  }
  return connectedPinsByPinId
}

const makeRailCarrierPackedLayout = (): OutputLayout => ({
  chipPlacements: {
    U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
    R1: { x: 7, y: 7, ccwRotationDegrees: 0 },
    R2: { x: 8, y: 7, ccwRotationDegrees: 0 },
    SJ1: { x: 9, y: 7, ccwRotationDegrees: 0 },
  },
  groupPlacements: {},
})

const alignRailCarrierFromPackedLayout = (
  inputProblem: InputProblem,
  baseLayout: OutputLayout,
): OutputLayout => {
  const solver = new ParallelAlignedPassiveSolver({
    partitionInputProblem: inputProblem,
    pinIdToStronglyConnectedPins: getConnectedPinsByPinId(inputProblem),
  })
  return (
    solver as unknown as {
      alignPassiveGroups(base: OutputLayout): OutputLayout
    }
  ).alignPassiveGroups(baseLayout)
}

const withFixedObstacle = ({
  inputProblem,
  x,
  y,
}: {
  inputProblem: InputProblem
  x: number
  y: number
}): InputProblem => {
  const next = structuredClone(inputProblem)
  next.chipMap.OBS = {
    chipId: "OBS",
    pins: [],
    size: { x: 0.2, y: 0.2 },
    availableRotations: [0],
    fixedPosition: { x, y },
  }
  return next
}

const makeRailCarrierObstacleProblem = ({
  targetChipId,
  clearance,
  chipGap = 0.5,
}: {
  targetChipId: "R2" | "SJ1"
  clearance: number
  chipGap?: number
}): {
  inputProblem: InputProblem
  baseLayout: OutputLayout
  unobstructedLayout: OutputLayout
} => {
  const inputProblem = makeDenseRailCarrierGapProblem()
  inputProblem.chipGap = chipGap
  const baseLayout = makeRailCarrierPackedLayout()
  const unobstructedLayout = alignRailCarrierFromPackedLayout(
    inputProblem,
    baseLayout,
  )
  const targetBounds = getChipBounds(
    inputProblem,
    targetChipId,
    unobstructedLayout.chipPlacements[targetChipId]!,
  )
  const obstacleX = targetBounds.maxX + clearance + 0.1
  const obstacleY = (targetBounds.minY + targetBounds.maxY) / 2

  return {
    inputProblem: withFixedObstacle({
      inputProblem,
      x: obstacleX,
      y: obstacleY,
    }),
    baseLayout: {
      chipPlacements: {
        ...baseLayout.chipPlacements,
        OBS: { x: obstacleX, y: obstacleY, ccwRotationDegrees: 0 },
      },
      groupPlacements: {},
    },
    unobstructedLayout,
  }
}

const expectPlacementToEqual = (
  actual: Placement,
  expected: Placement,
): void => {
  expect(actual.x).toBe(expected.x)
  expect(actual.y).toBe(expected.y)
  expect(actual.ccwRotationDegrees).toBe(expected.ccwRotationDegrees)
}

const getDistancesFromMovedGroup = (
  inputProblem: InputProblem,
  layout: OutputLayout,
): Array<{ pair: string; distance: number }> => {
  const movedChipIds = ["R1", "R2", "SJ1"]
  const pairs: Array<{ pair: string; distance: number }> = []
  for (const chipId of movedChipIds) {
    const chipBounds = getChipBounds(
      inputProblem,
      chipId,
      layout.chipPlacements[chipId]!,
    )
    for (const [otherChipId, otherPlacement] of Object.entries(
      layout.chipPlacements,
    )) {
      if (otherChipId === chipId) continue
      if (
        movedChipIds.includes(otherChipId) &&
        movedChipIds.indexOf(otherChipId) < movedChipIds.indexOf(chipId)
      ) {
        continue
      }
      const otherBounds = getChipBounds(
        inputProblem,
        otherChipId,
        otherPlacement,
      )
      pairs.push({
        pair: `${chipId}-${otherChipId}`,
        distance: getBoundsDistance(chipBounds, otherBounds),
      })
    }
  }
  return pairs
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
    makeRailCarrierProblem({ customIds: true, customNet: true }),
  )

  expect(groups).toHaveLength(1)
  expect(groups[0]!.railCarrier?.carrierChipId).toBe("selectable_bridge_a")
  expect(groups[0]!.passiveChipIds).toEqual(["pullup_lower", "pullup_upper"])
})

test("detects rail-carrier topology around a fixed main chip", () => {
  const groups = findSameSidePassiveGroups(
    makeRailCarrierProblem({ fixedMain: true }),
  )

  expect(groups).toHaveLength(1)
  expect(groups[0]!.mainChipId).toBe("U1")
  expect(groups[0]!.railCarrier?.carrierChipId).toBe("SJ1")
  expect(groups[0]!.passiveChipIds).toEqual(["R2", "R1"])
})

test("reflows rail-carrier passives around fixed main chips without moving them", () => {
  const cases = [
    { fixedMainPosition: { x: 0, y: 0 }, fixedMainRotation: 0 },
    { fixedMainPosition: { x: 10, y: 5 }, fixedMainRotation: 0 },
    { fixedMainPosition: { x: -7, y: -4 }, fixedMainRotation: 0 },
    { fixedMainPosition: { x: 100, y: -80 }, fixedMainRotation: 0 },
    { fixedMainPosition: { x: 0, y: 0 }, fixedMainRotation: 90 },
    { fixedMainPosition: { x: 0, y: 0 }, fixedMainRotation: 180 },
    { fixedMainPosition: { x: 0, y: 0 }, fixedMainRotation: 270 },
  ] as const

  for (const testCase of cases) {
    const inputProblem = makeRailCarrierProblem({
      fixedMain: true,
      fixedMainPosition: testCase.fixedMainPosition,
      fixedMainRotation: testCase.fixedMainRotation,
    })
    const solver = new LayoutPipelineSolver(inputProblem)
    solver.solve()
    const layout = solver.getOutputLayout()

    expect(
      solver.packInnerPartitionsSolver?.completedSolvers[0]?.constructor.name,
    ).toBe("ParallelAlignedPassiveSolver")
    expectPlacementToEqual(layout.chipPlacements.U1!, {
      ...testCase.fixedMainPosition,
      ccwRotationDegrees: testCase.fixedMainRotation,
    })
    expect(solver.checkForOverlaps(layout)).toHaveLength(0)
    for (const { distance } of getDistancesFromMovedGroup(
      inputProblem,
      layout,
    )) {
      expect(distance).toBeGreaterThanOrEqual(inputProblem.chipGap - 1e-6)
    }
  }
})

test("uses fixed main-chip rotation when ordering rail-carrier passives", () => {
  const groups = findSameSidePassiveGroups(
    makeRailCarrierProblem({ fixedMain: true, fixedMainRotation: 90 }),
  )

  expect(groups).toHaveLength(1)
  expect(groups[0]!.side).toBe("y+")
  expect(groups[0]!.passiveChipIds).toEqual(["R1", "R2"])
  expect(groups[0]!.mainChipPinIds).toEqual(["U1.4", "U1.3"])
})

test("declines rail-carrier topology when a resistor main-facing pin is branched", () => {
  expect(
    findSameSidePassiveGroups(
      makeRailCarrierProblem({ branchedMainFacingPin: true }),
    ),
  ).toHaveLength(0)
  expect(
    findSameSidePassiveGroups(
      makeRailCarrierProblem({
        branchedMainFacingPin: true,
        customIds: true,
      }),
    ),
  ).toHaveLength(0)

  const renamedOrderVariant = makeRailCarrierProblem({
    branchedMainFacingPin: true,
    customIds: true,
  })
  renamedOrderVariant.pinStrongConnMap = Object.fromEntries(
    Object.entries(renamedOrderVariant.pinStrongConnMap).reverse(),
  )
  expect(findSameSidePassiveGroups(renamedOrderVariant)).toHaveLength(0)
})

test("declines rail-carrier topology when a resistor carrier-facing pin is branched", () => {
  expect(
    findSameSidePassiveGroups(
      makeRailCarrierProblem({ branchedCarrierFacingPin: true }),
    ),
  ).toHaveLength(0)
})

test("declines fixed-main rail-carrier topology when a resistor pin is branched", () => {
  expect(
    findSameSidePassiveGroups(
      makeRailCarrierProblem({
        fixedMain: true,
        branchedMainFacingPin: true,
      }),
    ),
  ).toHaveLength(0)
})

test("enforces rail-carrier identity and cardinality invariants", () => {
  const cases: Array<{
    name: string
    mutate: (inputProblem: InputProblem) => void
    expectedRailGroups: number
  }> = [
    {
      name: "duplicate main pin",
      mutate: (inputProblem) => {
        replaceStrongConnection(inputProblem, "Uwide.2-R2.1", "Uwide.1-R2.1")
      },
      expectedRailGroups: 0,
    },
    {
      name: "all resistors share one main pin",
      mutate: (inputProblem) => {
        replaceStrongConnection(inputProblem, "Uwide.2-R2.1", "Uwide.1-R2.1")
        replaceStrongConnection(inputProblem, "Uwide.3-R3.1", "Uwide.1-R3.1")
      },
      expectedRailGroups: 0,
    },
    {
      name: "duplicate carrier pin",
      mutate: (inputProblem) => {
        replaceStrongConnection(inputProblem, "R2.2-Jwide.2", "R2.2-Jwide.1")
      },
      expectedRailGroups: 0,
    },
    {
      name: "all resistors share one carrier pin",
      mutate: (inputProblem) => {
        replaceStrongConnection(inputProblem, "R2.2-Jwide.2", "R2.2-Jwide.1")
        replaceStrongConnection(inputProblem, "R3.2-Jwide.3", "R3.2-Jwide.1")
      },
      expectedRailGroups: 0,
    },
    {
      name: "different main chip",
      mutate: (inputProblem) => {
        inputProblem.chipMap.Uother = {
          chipId: "Uother",
          pins: ["Uother.1", "Uother.2", "Uother.3", "Uother.4"],
          size: { x: 1.6, y: 1.6 },
          availableRotations: [0, 90, 180, 270],
        }
        inputProblem.chipPinMap["Uother.1"] = {
          pinId: "Uother.1",
          side: "x+",
          offset: { x: 1, y: 0 },
        }
        replaceStrongConnection(inputProblem, "Uwide.3-R3.1", "Uother.1-R3.1")
      },
      expectedRailGroups: 0,
    },
    {
      name: "different carrier chip",
      mutate: (inputProblem) => {
        inputProblem.chipMap.Jother = {
          chipId: "Jother",
          pins: ["Jother.1", "Jother.RAIL"],
          size: { x: 0.8, y: 0.8 },
          availableRotations: [0, 90, 180, 270],
        }
        inputProblem.chipPinMap["Jother.1"] = {
          pinId: "Jother.1",
          side: "x-",
          offset: { x: -0.4, y: 0 },
        }
        inputProblem.chipPinMap["Jother.RAIL"] = {
          pinId: "Jother.RAIL",
          side: "y+",
          offset: { x: 0, y: 0.4 },
        }
        inputProblem.netConnMap["Jother.RAIL-RAIL"] = true
        replaceStrongConnection(inputProblem, "R3.2-Jwide.3", "R3.2-Jother.1")
      },
      expectedRailGroups: 0,
    },
    {
      name: "same main and carrier chip",
      mutate: (inputProblem) => {
        replaceStrongConnection(inputProblem, "R1.2-Jwide.1", "R1.2-Uwide.4")
      },
      expectedRailGroups: 0,
    },
    {
      name: "main-facing branch",
      mutate: (inputProblem) => {
        inputProblem.chipMap.TP1 = {
          chipId: "TP1",
          pins: ["TP1.1"],
          size: { x: 0.2, y: 0.2 },
          availableRotations: [0],
        }
        inputProblem.chipPinMap["TP1.1"] = {
          pinId: "TP1.1",
          side: "x+",
          offset: { x: 0.1, y: 0 },
        }
        inputProblem.pinStrongConnMap["R1.1-TP1.1"] = true
      },
      expectedRailGroups: 0,
    },
    {
      name: "carrier-facing branch",
      mutate: (inputProblem) => {
        inputProblem.chipMap.TP1 = {
          chipId: "TP1",
          pins: ["TP1.1"],
          size: { x: 0.2, y: 0.2 },
          availableRotations: [0],
        }
        inputProblem.chipPinMap["TP1.1"] = {
          pinId: "TP1.1",
          side: "x+",
          offset: { x: 0.1, y: 0 },
        }
        inputProblem.pinStrongConnMap["R1.2-TP1.1"] = true
      },
      expectedRailGroups: 0,
    },
    {
      name: "carrier claimed pin branch",
      mutate: (inputProblem) => {
        inputProblem.chipMap.TP1 = {
          chipId: "TP1",
          pins: ["TP1.1"],
          size: { x: 0.2, y: 0.2 },
          availableRotations: [0],
        }
        inputProblem.chipPinMap["TP1.1"] = {
          pinId: "TP1.1",
          side: "x+",
          offset: { x: 0.1, y: 0 },
        }
        inputProblem.pinStrongConnMap["Jwide.1-TP1.1"] = true
      },
      expectedRailGroups: 0,
    },
    {
      name: "extra unexplained carrier pin",
      mutate: (inputProblem) => {
        inputProblem.chipMap.Jwide!.pins.push("Jwide.NC")
        inputProblem.chipPinMap["Jwide.NC"] = {
          pinId: "Jwide.NC",
          side: "y-",
          offset: { x: 0, y: -0.4 },
        }
      },
      expectedRailGroups: 0,
    },
    {
      name: "zero rail pins",
      mutate: (inputProblem) => {
        inputProblem.netConnMap = {}
      },
      expectedRailGroups: 0,
    },
    {
      name: "multiple rail pins",
      mutate: (inputProblem) => {
        inputProblem.chipMap.Jwide!.pins.push("Jwide.RAIL2")
        inputProblem.chipPinMap["Jwide.RAIL2"] = {
          pinId: "Jwide.RAIL2",
          side: "y+",
          offset: { x: 0.2, y: 0.4 },
        }
        inputProblem.netMap.RAIL2 = { netId: "RAIL2" }
        inputProblem.netConnMap["Jwide.RAIL2-RAIL2"] = true
      },
      expectedRailGroups: 0,
    },
    {
      name: "rail pin with ambiguous net membership",
      mutate: (inputProblem) => {
        inputProblem.netMap.OTHER = { netId: "OTHER" }
        inputProblem.netConnMap["Jwide.RAIL-OTHER"] = true
      },
      expectedRailGroups: 0,
    },
    {
      name: "partial carrier accounting",
      mutate: (inputProblem) => {
        delete inputProblem.pinStrongConnMap["R3.2-Jwide.3"]
      },
      expectedRailGroups: 0,
    },
    {
      name: "mixed main-chip side",
      mutate: (inputProblem) => {
        inputProblem.chipPinMap["Uwide.3"] = {
          pinId: "Uwide.3",
          side: "x-",
          offset: { x: -1, y: 0.2 },
        }
      },
      expectedRailGroups: 0,
    },
    {
      name: "same-side distinct pins with identical edge coordinate",
      mutate: (inputProblem) => {
        inputProblem.chipPinMap["Uwide.2"] = {
          ...inputProblem.chipPinMap["Uwide.2"]!,
          offset: { ...inputProblem.chipPinMap["Uwide.1"]!.offset },
        }
      },
      expectedRailGroups: 0,
    },
    {
      name: "fixed resistor",
      mutate: (inputProblem) => {
        inputProblem.chipMap.R1!.fixedPosition = { x: 2, y: 1 }
      },
      expectedRailGroups: 0,
    },
    {
      name: "fixed carrier",
      mutate: (inputProblem) => {
        inputProblem.chipMap.Jwide!.fixedPosition = { x: 3, y: 0 }
      },
      expectedRailGroups: 0,
    },
    {
      name: "fixed main remains valid",
      mutate: (inputProblem) => {
        inputProblem.chipMap.Uwide!.fixedPosition = { x: 0, y: 0 }
      },
      expectedRailGroups: 1,
    },
    {
      name: "reordered maps remain valid",
      mutate: (inputProblem) => {
        inputProblem.chipMap = reorderRecord(inputProblem.chipMap)
        inputProblem.chipPinMap = reorderRecord(inputProblem.chipPinMap)
        inputProblem.pinStrongConnMap = reorderRecord(
          inputProblem.pinStrongConnMap,
        )
        inputProblem.netConnMap = reorderRecord(inputProblem.netConnMap)
      },
      expectedRailGroups: 1,
    },
  ]

  for (const testCase of cases) {
    const groups = getRailCarrierGroups(
      makeRailCarrierContractProblem(testCase.mutate),
    )
    expect(groups, testCase.name).toHaveLength(testCase.expectedRailGroups)
    if (testCase.expectedRailGroups === 1) {
      expect(groups[0]!.passiveChipIds, testCase.name).toEqual([
        "R1",
        "R2",
        "R3",
      ])
    }
  }
})

test("declines mirrored or overlapping rail-carrier membership ambiguity", () => {
  expect(getRailCarrierGroups(makeMirroredRailCarrierProblem())).toHaveLength(0)

  const overlappingCarrierProblem = makeRailCarrierContractProblem(
    (inputProblem) => {
      inputProblem.chipMap.Jother = {
        chipId: "Jother",
        pins: ["Jother.1", "Jother.2", "Jother.RAIL"],
        size: { x: 0.8, y: 0.8 },
        availableRotations: [0, 90, 180, 270],
      }
      inputProblem.chipPinMap["Jother.1"] = {
        pinId: "Jother.1",
        side: "x-",
        offset: { x: -0.4, y: -0.1 },
      }
      inputProblem.chipPinMap["Jother.2"] = {
        pinId: "Jother.2",
        side: "x-",
        offset: { x: -0.4, y: 0.1 },
      }
      inputProblem.chipPinMap["Jother.RAIL"] = {
        pinId: "Jother.RAIL",
        side: "y+",
        offset: { x: 0, y: 0.4 },
      }
      inputProblem.netConnMap["Jother.RAIL-RAIL"] = true
      inputProblem.pinStrongConnMap["R2.2-Jother.1"] = true
      replaceStrongConnection(inputProblem, "R3.2-Jwide.3", "R3.2-Jother.2")
    },
  )

  expect(getRailCarrierGroups(overlappingCarrierProblem)).toHaveLength(0)
})

test("detects four-passive rail-carrier topology without a pin-count ceiling", () => {
  const groups = findSameSidePassiveGroups(
    makeMultiPassiveRailCarrierProblem({ passiveCount: 4 }),
  )

  expect(groups).toHaveLength(1)
  expect(groups[0]!.railCarrier?.carrierChipId).toBe("Jwide")
  expect(groups[0]!.passiveChipIds).toEqual(["R1", "R2", "R3", "R4"])
})

test("detects five-passive rail-carrier topology by exact carrier pin roles", () => {
  const groups = findSameSidePassiveGroups(
    makeMultiPassiveRailCarrierProblem({ passiveCount: 5 }),
  )

  expect(groups).toHaveLength(1)
  expect(groups[0]!.railCarrier?.carrierChipId).toBe("Jwide")
  expect(groups[0]!.passiveChipIds).toEqual(["R1", "R2", "R3", "R4", "R5"])
})

test("declines symmetric mirrored rail-carrier topology", () => {
  const groups = findSameSidePassiveGroups(makeMirroredRailCarrierProblem())

  expect(groups).toHaveLength(0)
})

test("declines mirrored rail-carrier topology when mirrored endpoints are fixed", () => {
  const problem = makeMirroredRailCarrierProblem()
  problem.chipMap.A!.fixedPosition = { x: 0, y: 0 }
  problem.chipMap.B!.fixedPosition = { x: 4, y: 0 }

  expect(findSameSidePassiveGroups(problem)).toHaveLength(0)
})

test("keeps dense rail-carrier passives at least chipGap apart", () => {
  const inputProblem = makeDenseRailCarrierGapProblem()
  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()
  const layout = solver.getOutputLayout()
  const r1Bounds = getChipBounds(inputProblem, "R1", layout.chipPlacements.R1!)
  const r2Bounds = getChipBounds(inputProblem, "R2", layout.chipPlacements.R2!)

  expect(
    solver.packInnerPartitionsSolver?.completedSolvers[0]?.constructor.name,
  ).toBe("ParallelAlignedPassiveSolver")
  expect(getBoundsDistance(r1Bounds, r2Bounds)).toBeGreaterThanOrEqual(
    inputProblem.chipGap - 1e-6,
  )
})

test("keeps dense fixed-main rail-carrier passives at least chipGap apart", () => {
  const inputProblem = makeDenseRailCarrierGapProblem()
  inputProblem.chipMap.U1!.fixedPosition = { x: 0, y: 0 }
  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()
  const layout = solver.getOutputLayout()

  expect(
    solver.packInnerPartitionsSolver?.completedSolvers[0]?.constructor.name,
  ).toBe("ParallelAlignedPassiveSolver")
  expectPlacementToEqual(layout.chipPlacements.U1!, {
    x: 0,
    y: 0,
    ccwRotationDegrees: 0,
  })
  for (const { distance } of getDistancesFromMovedGroup(inputProblem, layout)) {
    expect(distance).toBeGreaterThanOrEqual(inputProblem.chipGap - 1e-6)
  }
})

test("rejects rail-carrier reflow that would violate chipGap to an unrelated obstacle", () => {
  const { inputProblem, baseLayout, unobstructedLayout } =
    makeRailCarrierObstacleProblem({
      targetChipId: "R2",
      clearance: 0.1,
    })
  const obstacleBounds = getChipBounds(
    inputProblem,
    "OBS",
    baseLayout.chipPlacements.OBS!,
  )
  const proposedR1Distance = getBoundsDistance(
    getChipBounds(inputProblem, "R1", unobstructedLayout.chipPlacements.R1!),
    obstacleBounds,
  )
  const proposedR2Distance = getBoundsDistance(
    getChipBounds(inputProblem, "R2", unobstructedLayout.chipPlacements.R2!),
    obstacleBounds,
  )

  expect(proposedR1Distance).toBeGreaterThan(0)
  expect(proposedR1Distance).toBeLessThan(inputProblem.chipGap)
  expect(proposedR2Distance).toBeGreaterThan(0)
  expect(proposedR2Distance).toBeLessThan(inputProblem.chipGap)

  const layout = alignRailCarrierFromPackedLayout(inputProblem, baseLayout)
  for (const chipId of ["R1", "R2", "SJ1"]) {
    expectPlacementToEqual(
      layout.chipPlacements[chipId]!,
      baseLayout.chipPlacements[chipId]!,
    )
  }
})

test("fixed-main obstacle fallback leaves the main and rail group atomically packed", () => {
  const { inputProblem, baseLayout } = makeRailCarrierObstacleProblem({
    targetChipId: "R2",
    clearance: 0.1,
  })
  inputProblem.chipMap.U1!.fixedPosition = { x: 0, y: 0 }
  const layout = alignRailCarrierFromPackedLayout(inputProblem, baseLayout)

  for (const chipId of ["U1", "R1", "R2", "SJ1"]) {
    expectPlacementToEqual(
      layout.chipPlacements[chipId]!,
      baseLayout.chipPlacements[chipId]!,
    )
  }
})

test("rail-carrier obstacle boundary preserves chipGap semantics", () => {
  const cases = [
    { clearance: 0.1, chipGap: 0.5, shouldAccept: false },
    { clearance: 0.499, chipGap: 0.5, shouldAccept: false },
    { clearance: 0.5, chipGap: 0.5, shouldAccept: true },
    { clearance: 0.6, chipGap: 0.5, shouldAccept: true },
    { clearance: 0.1, chipGap: 0, shouldAccept: true },
  ]

  for (const testCase of cases) {
    const { inputProblem, baseLayout, unobstructedLayout } =
      makeRailCarrierObstacleProblem({
        targetChipId: "SJ1",
        clearance: testCase.clearance,
        chipGap: testCase.chipGap,
      })
    const layout = alignRailCarrierFromPackedLayout(inputProblem, baseLayout)

    for (const chipId of ["R1", "R2", "SJ1"]) {
      expectPlacementToEqual(
        layout.chipPlacements[chipId]!,
        (testCase.shouldAccept ? unobstructedLayout : baseLayout)
          .chipPlacements[chipId]!,
      )
    }
  }
})

test("accepted rail-carrier reflow satisfies chipGap for every moved pair", () => {
  const { inputProblem, baseLayout } = makeRailCarrierObstacleProblem({
    targetChipId: "SJ1",
    clearance: 0.6,
  })
  const layout = alignRailCarrierFromPackedLayout(inputProblem, baseLayout)
  const distances = getDistancesFromMovedGroup(inputProblem, layout)

  expect(distances.map((entry) => entry.pair).sort()).toEqual([
    "R1-OBS",
    "R1-R2",
    "R1-SJ1",
    "R1-U1",
    "R2-OBS",
    "R2-SJ1",
    "R2-U1",
    "SJ1-OBS",
    "SJ1-U1",
  ])
  for (const { distance } of distances) {
    expect(distance).toBeGreaterThanOrEqual(inputProblem.chipGap - 1e-6)
  }
})

test("reflows rail-carrier groups using the actual packed main-chip rotation", () => {
  const inputProblem = makeRotatedPackedMainRailCarrierProblem()
  const detectedGroups = findSameSidePassiveGroups(inputProblem)
  const solver = new LayoutPipelineSolver(inputProblem)
  solver.solve()
  const layout = solver.getOutputLayout()
  const mainPlacement = layout.chipPlacements.A!
  const mainBounds = getChipBounds(inputProblem, "A", mainPlacement)

  expect(detectedGroups).toHaveLength(1)
  expect(detectedGroups[0]!.side).toBe("y+")
  expect(mainPlacement.ccwRotationDegrees).toBe(90)
  for (const passiveChipId of ["R1", "R2", "R3", "R4"]) {
    const passiveBounds = getChipBounds(
      inputProblem,
      passiveChipId,
      layout.chipPlacements[passiveChipId]!,
    )
    expect(passiveBounds.maxX).toBeLessThanOrEqual(
      mainBounds.minX - inputProblem.chipGap + 1e-6,
    )
  }
})

test("declines rail-carrier topology for diode-like or untyped leaves", () => {
  expect(
    findSameSidePassiveGroups(
      makeMultiPassiveRailCarrierProblem({ diodeLikeFirstPassive: true }),
    ),
  ).toHaveLength(0)
  expect(
    findSameSidePassiveGroups(
      makeMultiPassiveRailCarrierProblem({ untypedFirstPassive: true }),
    ),
  ).toHaveLength(0)
})

test("declines rail-carrier topology for non-two-pin passive leaves", () => {
  expect(
    findSameSidePassiveGroups(
      makeMultiPassiveRailCarrierProblem({ transistorLikeFirstPassive: true }),
    ),
  ).toHaveLength(0)
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

test("declines larger carriers with unexplained pins or branches", () => {
  expect(
    findSameSidePassiveGroups(
      makeMultiPassiveRailCarrierProblem({ extraBranch: true }),
    ),
  ).toHaveLength(0)
  expect(
    findSameSidePassiveGroups(
      makeMultiPassiveRailCarrierProblem({ extraCarrierPin: true }),
    ),
  ).toHaveLength(0)
  expect(
    findSameSidePassiveGroups(
      makeMultiPassiveRailCarrierProblem({ largeCarrierLike: true }),
    ),
  ).toHaveLength(0)
})

test("declines four-passive carrier with multiple possible rail pins", () => {
  expect(
    findSameSidePassiveGroups(
      makeMultiPassiveRailCarrierProblem({ multipleRailPins: true }),
    ),
  ).toHaveLength(0)
})

test("declines rail-carrier topology when the carrier is fixed", () => {
  expect(
    findSameSidePassiveGroups(makeRailCarrierProblem({ fixedCarrier: true })),
  ).toHaveLength(0)
  expect(
    findSameSidePassiveGroups(
      makeRailCarrierProblem({ fixedMain: true, fixedCarrier: true }),
    ),
  ).toHaveLength(0)
})

test("declines rail-carrier topology when a passive is fixed", () => {
  expect(
    findSameSidePassiveGroups(makeRailCarrierProblem({ fixedPassive: true })),
  ).toHaveLength(0)
  expect(
    findSameSidePassiveGroups(
      makeRailCarrierProblem({ fixedMain: true, fixedPassive: true }),
    ),
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
