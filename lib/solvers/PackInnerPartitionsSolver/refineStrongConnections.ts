import {
  boundsAreaOverlap,
  boundsDistance,
  doesSegmentIntersectRect,
  doSegmentsIntersect,
  type Point,
} from "@tscircuit/math-utils"
import type {
  ChipId,
  ChipPin,
  InputProblem,
  PinId,
} from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { createPinOwnerMap } from "../../utils/createPinOwnerMap"
import { rotatePinOffset } from "../../utils/rotatePinOffset"
import { getPlacementBounds } from "../AlignTestPointsSolver/placementsOverlap"

const EPSILON = 1e-6
const MAX_PASSES = 4

type Connection = { firstPinId: PinId; secondPinId: PinId }
type Context = {
  inputProblem: InputProblem
  chipPlacements: OutputLayout["chipPlacements"]
  pinOwners: ReturnType<typeof createPinOwnerMap>
  connections: Connection[]
}

const getPinPosition = (pinId: PinId, context: Context): Point => {
  const chip = context.pinOwners.get(pinId)!
  const placement = context.chipPlacements[chip.chipId]!
  const offset = rotatePinOffset(
    context.inputProblem.chipPinMap[pinId]!.offset,
    placement.ccwRotationDegrees,
  )
  return { x: placement.x + offset.x, y: placement.y + offset.y }
}

const getConnectionGeometry = (connection: Connection, context: Context) => {
  const first = getPinPosition(connection.firstPinId, context)
  const second = getPinPosition(connection.secondPinId, context)
  const dx = Math.abs(first.x - second.x)
  const dy = Math.abs(first.y - second.y)
  return { first, second, length: dx + dy, offAxis: Math.min(dx, dy) }
}

const hasChipClearance = (chipId: ChipId, context: Context): boolean => {
  const bounds = getPlacementBounds({
    placement: context.chipPlacements[chipId]!,
    size: context.inputProblem.chipMap[chipId]!.size,
  })
  for (const [otherChipId, placement] of Object.entries(
    context.chipPlacements,
  )) {
    if (chipId === otherChipId) continue
    const otherBounds = getPlacementBounds({
      placement,
      size: context.inputProblem.chipMap[otherChipId]!.size,
    })
    if (
      boundsAreaOverlap(bounds, otherBounds) > 0 ||
      boundsDistance(bounds, otherBounds) <
        context.inputProblem.chipGap - EPSILON
    )
      return false
  }
  return true
}

// A shorter straight-line preview must not acquire a new body obstruction or
// cross another connection. These are preview constraints, not a routing proof.
const getIntersections = (context: Context): Set<string> => {
  const intersections = new Set<string>()
  const segments = context.connections.map((connection) =>
    getConnectionGeometry(connection, context),
  )
  for (const [index, connection] of context.connections.entries()) {
    const segment = segments[index]!
    for (const [chipId, placement] of Object.entries(context.chipPlacements)) {
      if (
        context.pinOwners.get(connection.firstPinId)!.chipId === chipId ||
        context.pinOwners.get(connection.secondPinId)!.chipId === chipId
      )
        continue
      const bounds = getPlacementBounds({
        placement,
        size: context.inputProblem.chipMap[chipId]!.size,
      })
      if (doesSegmentIntersectRect(segment.first, segment.second, bounds))
        intersections.add(`body:${index}:${chipId}`)
    }
    for (
      let otherIndex = index + 1;
      otherIndex < context.connections.length;
      otherIndex++
    ) {
      const otherConnection = context.connections[otherIndex]!
      if (
        [connection.firstPinId, connection.secondPinId].some(
          (pinId) =>
            pinId === otherConnection.firstPinId ||
            pinId === otherConnection.secondPinId,
        )
      )
        continue
      const otherSegment = segments[otherIndex]!
      if (
        doSegmentsIntersect(
          segment.first,
          segment.second,
          otherSegment.first,
          otherSegment.second,
        )
      )
        intersections.add(`cross:${index}:${otherIndex}`)
    }
  }
  return intersections
}

/** Refine only small, degree-two components in the generic packer's result. */
export const refineStrongConnections = ({
  inputProblem,
  inputLayout,
  connectedPinsByPinId,
}: {
  inputProblem: InputProblem
  inputLayout: OutputLayout
  connectedPinsByPinId: Record<PinId, ChipPin[]>
}): OutputLayout => {
  const outputLayout = structuredClone(inputLayout)
  const pinOwners = createPinOwnerMap(inputProblem)
  const connections: Connection[] = []
  for (const firstPinId of Object.keys(connectedPinsByPinId).sort()) {
    for (const secondPin of connectedPinsByPinId[firstPinId]!) {
      const firstChip = pinOwners.get(firstPinId)
      const secondChip = pinOwners.get(secondPin.pinId)
      if (
        !firstChip ||
        !secondChip ||
        firstChip === secondChip ||
        firstPinId >= secondPin.pinId
      )
        continue
      if (
        !outputLayout.chipPlacements[firstChip.chipId] ||
        !outputLayout.chipPlacements[secondChip.chipId]
      )
        continue
      connections.push({ firstPinId, secondPinId: secondPin.pinId })
    }
  }
  const context: Context = {
    inputProblem,
    chipPlacements: outputLayout.chipPlacements,
    pinOwners,
    connections,
  }
  const originalIntersections = getIntersections(context)
  const chips = Object.values(inputProblem.chipMap).sort((a, b) =>
    a.chipId.localeCompare(b.chipId),
  )
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let moved = false
    for (const chip of chips) {
      if (chip.fixedPosition || chip.pins.length < 2 || chip.pins.length > 3)
        continue
      const linked = connections.filter(
        (connection) =>
          pinOwners.get(connection.firstPinId)!.chipId === chip.chipId ||
          pinOwners.get(connection.secondPinId)!.chipId === chip.chipId,
      )
      if (linked.length !== 2) continue
      const original = context.chipPlacements[chip.chipId]!
      const originalGeometry = linked.map((connection) =>
        getConnectionGeometry(connection, context),
      )
      let bestPlacement: Placement = original
      let bestLength = originalGeometry.reduce(
        (sum, geometry) => sum + geometry.length,
        0,
      )
      let bestOffAxis = originalGeometry.reduce(
        (sum, geometry) => sum + geometry.offAxis,
        0,
      )
      for (const ccwRotationDegrees of chip.availableRotations ?? [
        0, 90, 180, 270,
      ]) {
        context.chipPlacements[chip.chipId] = {
          ...original,
          ccwRotationDegrees,
        }
        const xCoordinates = new Set([original.x])
        const yCoordinates = new Set([original.y])
        for (const connection of linked) {
          const firstIsOwn =
            pinOwners.get(connection.firstPinId)!.chipId === chip.chipId
          const ownPinId = firstIsOwn
            ? connection.firstPinId
            : connection.secondPinId
          const otherPinId = firstIsOwn
            ? connection.secondPinId
            : connection.firstPinId
          const otherPosition = getPinPosition(otherPinId, context)
          const offset = rotatePinOffset(
            inputProblem.chipPinMap[ownPinId]!.offset,
            ccwRotationDegrees,
          )
          xCoordinates.add(otherPosition.x - offset.x)
          yCoordinates.add(otherPosition.y - offset.y)
        }
        for (const x of xCoordinates)
          for (const y of yCoordinates) {
            context.chipPlacements[chip.chipId] = { x, y, ccwRotationDegrees }
            const candidateGeometry = linked.map((connection) =>
              getConnectionGeometry(connection, context),
            )
            if (
              candidateGeometry.some(
                (geometry, index) =>
                  geometry.length > originalGeometry[index]!.length + EPSILON,
              )
            )
              continue
            const length = candidateGeometry.reduce(
              (sum, geometry) => sum + geometry.length,
              0,
            )
            const offAxis = candidateGeometry.reduce(
              (sum, geometry) => sum + geometry.offAxis,
              0,
            )
            if (
              !(
                length < bestLength - EPSILON ||
                (Math.abs(length - bestLength) <= EPSILON &&
                  offAxis < bestOffAxis - EPSILON)
              )
            )
              continue
            if (!hasChipClearance(chip.chipId, context)) continue
            bestPlacement = context.chipPlacements[chip.chipId]!
            bestLength = length
            bestOffAxis = offAxis
          }
      }
      context.chipPlacements[chip.chipId] = bestPlacement
      moved ||= bestPlacement !== original
    }
    if (!moved) break
  }
  if (
    [...getIntersections(context)].some(
      (intersection) => !originalIntersections.has(intersection),
    )
  )
    return structuredClone(inputLayout)
  return outputLayout
}
