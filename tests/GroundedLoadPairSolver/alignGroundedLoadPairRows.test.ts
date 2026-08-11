import { expect, test } from "bun:test"
import { alignGroundedLoadPairRows } from "lib/solvers/GroundedLoadPairSolver/alignGroundedLoadPairRows"
import { getGroundedLoadPairs } from "lib/solvers/GroundedLoadPairSolver/getGroundedLoadPairs"
import type { ChipId, InputProblem, NetId } from "lib/types/InputProblem"
import type { Placement } from "lib/types/OutputLayout"
import { rotatePinOffset } from "lib/utils/rotatePinOffset"

const CHIP_WIDTH_AFTER_ROTATION = 0.4

const createInputProblem = (): InputProblem => {
  const inputProblem: InputProblem = {
    chipMap: {},
    chipPinMap: {},
    netMap: {
      V3: { netId: "V3", isPositiveVoltageSource: true },
      V5: { netId: "V5", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.6,
    partitionGap: 1.2,
  }

  for (const { pairId, positiveRailNetId } of [
    { pairId: "V3_A", positiveRailNetId: "V3" },
    { pairId: "V5_A", positiveRailNetId: "V5" },
    { pairId: "V3_B", positiveRailNetId: "V3" },
    { pairId: "V5_B", positiveRailNetId: "V5" },
  ] as Array<{ pairId: string; positiveRailNetId: NetId }>) {
    const upperChipId = `R_${pairId}`
    const lowerChipId = `D_${pairId}`
    const upperOuterPinId = `${upperChipId}.1`
    const upperInnerPinId = `${upperChipId}.2`
    const lowerInnerPinId = `${lowerChipId}.1`
    const groundPinId = `${lowerChipId}.2`
    inputProblem.chipMap[upperChipId] = {
      chipId: upperChipId,
      pins: [upperOuterPinId, upperInnerPinId],
      size: { x: 1, y: CHIP_WIDTH_AFTER_ROTATION },
      availableRotations: [270],
    }
    inputProblem.chipMap[lowerChipId] = {
      chipId: lowerChipId,
      pins: [lowerInnerPinId, groundPinId],
      size: { x: 1, y: CHIP_WIDTH_AFTER_ROTATION },
      availableRotations: [270],
    }
    for (const pinId of [upperOuterPinId, lowerInnerPinId]) {
      inputProblem.chipPinMap[pinId] = {
        pinId,
        offset: { x: -0.5, y: 0 },
        side: "x-",
      }
    }
    for (const pinId of [upperInnerPinId, groundPinId]) {
      inputProblem.chipPinMap[pinId] = {
        pinId,
        offset: { x: 0.5, y: 0 },
        side: "x+",
      }
    }
    inputProblem.pinStrongConnMap[`${upperInnerPinId}-${lowerInnerPinId}`] =
      true
    inputProblem.pinStrongConnMap[`${lowerInnerPinId}-${upperInnerPinId}`] =
      true
    inputProblem.netConnMap[`${upperOuterPinId}-${positiveRailNetId}`] = true
    inputProblem.netConnMap[`${groundPinId}-GND`] = true
  }

  return inputProblem
}

test("groups shared-ground load pairs by positive rail", () => {
  const inputProblem = createInputProblem()
  const chipPlacements: Record<ChipId, Placement> = {}
  for (const [pairIndex, pairId] of [
    "V3_A",
    "V5_A",
    "V3_B",
    "V5_B",
  ].entries()) {
    const pairX = pairIndex * 2
    const pairY = pairIndex * 0.5
    chipPlacements[`R_${pairId}`] = {
      x: pairX,
      y: pairY + 1,
      ccwRotationDegrees: 270,
    }
    chipPlacements[`D_${pairId}`] = {
      x: pairX,
      y: pairY - 1,
      ccwRotationDegrees: 270,
    }
  }
  const groundedLoadPairs = getGroundedLoadPairs(inputProblem)
  expect(groundedLoadPairs).toHaveLength(4)

  alignGroundedLoadPairRows({
    groundedLoadPairs,
    chipPlacements,
    inputProblem,
  })

  const groundPinYs = groundedLoadPairs.map((groundedLoadPair) => {
    const placement = chipPlacements[groundedLoadPair.lowerChip.chipId]!
    const groundPin = inputProblem.chipPinMap[groundedLoadPair.groundPinId]!
    return (
      placement.y +
      rotatePinOffset(groundPin.offset, placement.ccwRotationDegrees).y
    )
  })
  expect(Math.max(...groundPinYs) - Math.min(...groundPinYs)).toBeCloseTo(0)

  const v3PairGap =
    chipPlacements.R_V3_B!.x -
    chipPlacements.R_V3_A!.x -
    CHIP_WIDTH_AFTER_ROTATION
  const v5PairGap =
    chipPlacements.R_V5_B!.x -
    chipPlacements.R_V5_A!.x -
    CHIP_WIDTH_AFTER_ROTATION
  const powerPartitionGap =
    chipPlacements.R_V5_A!.x -
    chipPlacements.R_V3_B!.x -
    CHIP_WIDTH_AFTER_ROTATION
  expect(v3PairGap).toBeCloseTo(inputProblem.chipGap)
  expect(v5PairGap).toBeCloseTo(inputProblem.chipGap)
  expect(powerPartitionGap).toBeCloseTo(inputProblem.partitionGap)
})
