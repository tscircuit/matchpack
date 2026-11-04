import type { Point } from "@tscircuit/math-utils"
import type { Chip, ChipPin, InputProblem } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { createPinOwnerMap } from "../../utils/createPinOwnerMap"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import { getPinIdToStronglyConnectedPinsObj } from "../LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"
import { placementsOverlap } from "../AlignTestPointsSolver/placementsOverlap"

const EPSILON = 1e-6
const SIDE_VECTOR = {
  "x+": { x: 1, y: 0 },
  "x-": { x: -1, y: 0 },
  "y+": { x: 0, y: 1 },
  "y-": { x: 0, y: -1 },
}
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y
const subtract = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y })
const pinPosition = (pin: ChipPin, placement: Placement): Point => {
  const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
  return { x: placement.x + offset.x, y: placement.y + offset.y }
}
type Branch = {
  chip: Chip
  anchorPin: ChipPin
  nearPin: ChipPin
  farPin: ChipPin
  bridgePin: ChipPin
}

/**
 * Arrange a two-branch loop as a row beside its common anchor. The branches
 * must each have two pins, and terminate on opposite pins of one three-pin
 * bridge. Recognition uses connectivity and pin geometry, never refdes names.
 * Only the three movable members change; unrelated or obstructed loops retain
 * their incoming layout. This pass does not route wires or change connectivity.
 */
export function alignParallelBranches(
  input: InputProblem,
  incoming: OutputLayout,
): OutputLayout {
  const output = structuredClone(incoming)
  const owners = createPinOwnerMap(input)
  const connected = getPinIdToStronglyConnectedPinsObj(input)
  const moved = new Set<string>()
  const world = (pin: ChipPin) =>
    pinPosition(pin, output.chipPlacements[owners.get(pin.pinId)!.chipId]!)

  for (const anchor of Object.values(input.chipMap)) {
    const anchorPlacement = output.chipPlacements[anchor.chipId]
    if (anchor.pins.length < 4 || !anchorPlacement) continue
    const byBridge = new Map<string, Branch[]>()
    for (const anchorPinId of anchor.pins) {
      const anchorPin = input.chipPinMap[anchorPinId]
      if (!anchorPin) continue
      for (const nearPin of connected[anchorPinId] ?? []) {
        const chip = owners.get(nearPin.pinId)
        if (
          !chip ||
          chip.pins.length !== 2 ||
          chip.isCapacitor ||
          chip.isCrystal
        )
          continue
        const farPin =
          input.chipPinMap[chip.pins.find((id) => id !== nearPin.pinId)!]
        if (!farPin || (connected[nearPin.pinId]?.length ?? 0) !== 1) continue
        const farConnections = connected[farPin.pinId] ?? []
        if (farConnections.length !== 1) continue
        const bridgePin = farConnections[0]!
        const bridge = owners.get(bridgePin.pinId)
        if (
          !bridge ||
          bridge.chipId === anchor.chipId ||
          bridge.pins.length !== 3
        )
          continue
        const branches = byBridge.get(bridge.chipId) ?? []
        branches.push({ chip, anchorPin, nearPin, farPin, bridgePin })
        byBridge.set(bridge.chipId, branches)
      }
    }

    for (const [bridgeId, members] of byBridge) {
      if (members.length !== 2) continue
      const [first, second] = members as [Branch, Branch]
      if (
        first.chip.chipId === second.chip.chipId ||
        first.anchorPin.pinId === second.anchorPin.pinId ||
        first.bridgePin.pinId === second.bridgePin.pinId ||
        first.anchorPin.side !== second.anchorPin.side
      )
        continue
      const bridge = input.chipMap[bridgeId]!
      const movable = [first.chip, second.chip, bridge]
      if (
        movable.some(
          (chip) =>
            chip.fixedPosition ||
            moved.has(chip.chipId) ||
            !output.chipPlacements[chip.chipId],
        )
      )
        continue
      // A bridge endpoint with additional strong branches is not this motif.
      if (
        members.some(
          (member) => connected[member.bridgePin.pinId]?.length !== 1,
        )
      )
        continue

      const normal = rotatePinOffset(
        SIDE_VECTOR[first.anchorPin.side],
        anchorPlacement.ccwRotationDegrees,
      )
      const tangent = { x: -normal.y, y: normal.x }
      const local = (point: Point) => {
        const relative = subtract(point, anchorPlacement)
        return { x: dot(relative, normal), y: dot(relative, tangent) }
      }
      const place = (u: number, v: number, rotation: number): Placement => ({
        x: anchorPlacement.x + normal.x * u + tangent.x * v,
        y: anchorPlacement.y + normal.y * u + tangent.y * v,
        ccwRotationDegrees: rotation,
      })
      const sizeInFrame = (chip: Chip, rotation: number) => {
        const size = getRotatedSize(chip.size, rotation)
        return {
          x: Math.abs(normal.x) * size.x + Math.abs(normal.y) * size.y,
          y: Math.abs(tangent.x) * size.x + Math.abs(tangent.y) * size.y,
        }
      }
      // Keep a tiny numerical cushion around exact touching clearance bounds.
      const gap = Math.max(input.chipGap, 0) + EPSILON
      const anchorSize = sizeInFrame(anchor, anchorPlacement.ccwRotationDegrees)
      const outwardStart = Math.max(
        anchorSize.x / 2,
        ...members.map((m) => local(world(m.anchorPin)).x),
      )
      let best:
        | { placements: Record<string, Placement>; cost: number }
        | undefined

      for (const sign of [1, -1]) {
        // The outer anchor pin gets the nearer column, avoiding crossed leads.
        const branches = [...members].sort(
          (a, b) =>
            sign * (local(world(b.anchorPin)).y - local(world(a.anchorPin)).y),
        )
        const rotations = branches.map((branch) =>
          (branch.chip.availableRotations ?? [0, 90, 180, 270]).find(
            (rotation) => {
              const delta = rotatePinOffset(
                subtract(branch.farPin.offset, branch.nearPin.offset),
                rotation,
              )
              return (
                Math.abs(dot(delta, normal)) < EPSILON &&
                sign * dot(delta, tangent) > EPSILON
              )
            },
          ),
        )
        if (rotations.some((rotation) => rotation === undefined)) continue
        const sizes = branches.map((branch, index) =>
          sizeInFrame(branch.chip, rotations[index]!),
        )
        const branchV =
          sign *
          (Math.max(...members.map((m) => sign * local(world(m.anchorPin)).y)) +
            gap +
            Math.max(...sizes.map((s) => s.y)) / 2)

        for (const bridgeRotation of bridge.availableRotations ?? [
          0, 90, 180, 270,
        ]) {
          const offsets = branches.map((branch) =>
            rotatePinOffset(branch.bridgePin.offset, bridgeRotation),
          )
          const delta = subtract(offsets[1]!, offsets[0]!)
          if (
            dot(delta, normal) <= EPSILON ||
            Math.abs(dot(delta, tangent)) > EPSILON
          )
            continue
          const bridgeSize = sizeInFrame(bridge, bridgeRotation)
          for (const extraGap of [0, gap, gap * 2]) {
            const u0 = outwardStart + gap + sizes[0]!.x / 2 + extraGap
            const u1 = u0 + (sizes[0]!.x + sizes[1]!.x) / 2 + gap
            const bridgeU =
              (u0 + u1 - dot(offsets[0]!, normal) - dot(offsets[1]!, normal)) /
              2
            const bridgeV =
              branchV +
              sign *
                (Math.max(...sizes.map((s) => s.y)) / 2 +
                  gap +
                  bridgeSize.y / 2)
            const placements: Record<string, Placement> = {
              [branches[0]!.chip.chipId]: place(u0, branchV, rotations[0]!),
              [branches[1]!.chip.chipId]: place(u1, branchV, rotations[1]!),
              [bridgeId]: place(bridgeU, bridgeV, bridgeRotation),
            }
            const combined = { ...output.chipPlacements, ...placements }
            const collision = movable.some((chip) =>
              Object.entries(combined).some(
                ([otherId, other]) =>
                  otherId !== chip.chipId &&
                  placementsOverlap({
                    inputProblem: input,
                    chipIdA: chip.chipId,
                    placementA: placements[chip.chipId]!,
                    chipIdB: otherId,
                    placementB: other,
                  }),
              ),
            )
            if (collision) continue
            const cost = branches.reduce((sum, branch) => {
              const near = pinPosition(
                branch.nearPin,
                placements[branch.chip.chipId]!,
              )
              const far = pinPosition(
                branch.farPin,
                placements[branch.chip.chipId]!,
              )
              const end = pinPosition(branch.bridgePin, placements[bridgeId]!)
              const start = world(branch.anchorPin)
              return (
                sum +
                Math.hypot(start.x - near.x, start.y - near.y) +
                Math.hypot(end.x - far.x, end.y - far.y)
              )
            }, 0)
            if (!best || cost < best.cost - EPSILON) best = { placements, cost }
          }
        }
      }
      if (best) {
        Object.assign(output.chipPlacements, best.placements)
        for (const chip of movable) moved.add(chip.chipId)
      }
    }
  }
  return output
}
