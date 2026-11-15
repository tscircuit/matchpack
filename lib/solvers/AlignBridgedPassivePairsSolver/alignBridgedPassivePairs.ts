import {
  boundsAreaOverlap,
  boundsDistance,
  doesSegmentIntersectRect,
  doSegmentsIntersect,
  type Point,
} from "@tscircuit/math-utils"
import type { Chip, InputProblem, PinId } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { createPinOwnerMap } from "../../utils/createPinOwnerMap"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"
import { getPlacementBounds } from "../AlignTestPointsSolver/placementsOverlap"
import { getPinIdToStronglyConnectedPinsObj } from "../LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"

const EPSILON = 1e-6
const ROTATIONS = [0, 90, 180, 270] as const
export type PartitionMembership = ReadonlyArray<Pick<InputProblem, "chipMap">>
type Edge = [PinId, PinId]
type Link = { self: PinId; other: PinId; chip: Chip }
type Branch = {
  chip: Chip
  mainPin: PinId
  nearPin: PinId
  farPin: PinId
  bridgePin: PinId
}
type Group = { main: Chip; bridge: Chip; branches: [Branch, Branch] }
const dot = (p: Point, axis: Point) => p.x * axis.x + p.y * axis.y

/** Two separate series branches ending at a three-pin jumper, not at one pin. */
const findGroups = (problem: InputProblem, edges: Edge[]): Group[] => {
  const owners = createPinOwnerMap(problem)
  const links = new Map<string, Link[]>()
  for (const [a, b] of edges) {
    const first = owners.get(a)!,
      second = owners.get(b)!
    links.set(first.chipId, [
      ...(links.get(first.chipId) ?? []),
      { self: a, other: b, chip: second },
    ])
    links.set(second.chipId, [
      ...(links.get(second.chipId) ?? []),
      { self: b, other: a, chip: first },
    ])
  }
  const candidates = new Map<
    string,
    { main: Chip; bridge: Chip; branches: Branch[] }
  >()
  for (const chip of Object.values(problem.chipMap)) {
    const connected = links.get(chip.chipId) ?? []
    if (
      chip.pins.length !== 2 ||
      chip.fixedPosition ||
      connected.length !== 2 ||
      connected[0]!.self === connected[1]!.self
    )
      continue
    const anchor = connected.find((link) => link.chip.pins.length >= 4)
    const terminal = connected.find((link) => link.chip.pins.length === 3)
    if (!anchor || !terminal || terminal.chip.fixedPosition) continue
    const mainPin = problem.chipPinMap[anchor.other]
    if (!mainPin) continue
    const key = JSON.stringify([
      anchor.chip.chipId,
      terminal.chip.chipId,
      mainPin.side,
    ])
    const group = candidates.get(key) ?? {
      main: anchor.chip,
      bridge: terminal.chip,
      branches: [],
    }
    group.branches.push({
      chip,
      mainPin: anchor.other,
      nearPin: anchor.self,
      farPin: terminal.self,
      bridgePin: terminal.other,
    })
    candidates.set(key, group)
  }
  return [...candidates.values()].flatMap((group) => {
    if (group.branches.length !== 2) return []
    const [a, b] = group.branches
    const terminalLinks = links.get(group.bridge.chipId) ?? []
    if (
      a!.mainPin === b!.mainPin ||
      a!.bridgePin === b!.bridgePin ||
      terminalLinks.length !== 2
    )
      return []
    if (
      !terminalLinks.every((link) =>
        group.branches.some(
          (branch) => branch.chip.chipId === link.chip.chipId,
        ),
      )
    )
      return []
    return [{ ...group, branches: [a!, b!] as [Branch, Branch] }]
  })
}

const position = (
  problem: InputProblem,
  placements: OutputLayout["chipPlacements"],
  owners: ReturnType<typeof createPinOwnerMap>,
  pin: PinId,
): Point => {
  const placement = placements[owners.get(pin)!.chipId]!
  const offset = rotatePinOffset(
    problem.chipPinMap[pin]!.offset,
    placement.ccwRotationDegrees,
  )
  return { x: placement.x + offset.x, y: placement.y + offset.y }
}

const propose = (
  problem: InputProblem,
  original: OutputLayout["chipPlacements"],
  group: Group,
): OutputLayout["chipPlacements"] | null => {
  const anchor = original[group.main.chipId],
    terminal = original[group.bridge.chipId]
  if (
    !anchor ||
    !terminal ||
    group.branches.some((branch) => !original[branch.chip.chipId])
  )
    return null
  const side = problem.chipPinMap[group.branches[0].mainPin]!.side
  const direction =
    side === "x+"
      ? { x: 1, y: 0 }
      : side === "x-"
        ? { x: -1, y: 0 }
        : side === "y+"
          ? { x: 0, y: 1 }
          : { x: 0, y: -1 }
  const outward = rotatePinOffset(direction, anchor.ccwRotationDegrees)
  const tangent = { x: -outward.y, y: outward.x }
  const owners = createPinOwnerMap(problem)
  const halfExtent = (chip: Chip, rotation: number, axis: Point) => {
    const size = getRotatedSize(chip.size, rotation)
    return (Math.abs(axis.x) * size.x + Math.abs(axis.y) * size.y) / 2
  }
  const world = (normal: number, transverse: number): Point => ({
    x: outward.x * normal + tangent.x * transverse,
    y: outward.y * normal + tangent.y * transverse,
  })
  const branches = [...group.branches].sort(
    (a, b) =>
      dot(position(problem, original, owners, a.mainPin), tangent) -
      dot(position(problem, original, owners, b.mainPin), tangent),
  )
  const outer = Math.max(
    dot(anchor, outward) +
      halfExtent(group.main, anchor.ccwRotationDegrees, outward),
    ...branches.map((branch) =>
      dot(position(problem, original, owners, branch.mainPin), outward),
    ),
  )
  const rows = branches.map((branch) => {
    const rotations = branch.chip.availableRotations ?? [...ROTATIONS]
    const rotation = rotations.find((rotation) => {
      const near = rotatePinOffset(
        problem.chipPinMap[branch.nearPin]!.offset,
        rotation,
      )
      const far = rotatePinOffset(
        problem.chipPinMap[branch.farPin]!.offset,
        rotation,
      )
      return (
        dot(far, outward) - dot(near, outward) > EPSILON &&
        Math.abs(dot(far, tangent) - dot(near, tangent)) < EPSILON
      )
    })
    if (rotation === undefined) return null
    const near = rotatePinOffset(
      problem.chipPinMap[branch.nearPin]!.offset,
      rotation,
    )
    const far = rotatePinOffset(
      problem.chipPinMap[branch.farPin]!.offset,
      rotation,
    )
    return {
      branch,
      rotation,
      far,
      normal:
        outer + problem.chipGap + halfExtent(branch.chip, rotation, outward),
      transverse:
        dot(position(problem, original, owners, branch.mainPin), tangent) -
        dot(near, tangent),
      halfT: halfExtent(branch.chip, rotation, tangent),
    }
  })
  const [first, second] = rows
  if (!first || !second) return null
  const missingSpace =
    first.halfT +
    problem.chipGap +
    second.halfT -
    (second.transverse - first.transverse)
  if (missingSpace > 0) {
    first.transverse -= missingSpace / 2
    second.transverse += missingSpace / 2
  }

  // Preserve the bridge's existing orientation, including its third/net pin.
  const rotation = terminal.ccwRotationDegrees
  if (
    group.bridge.availableRotations &&
    !group.bridge.availableRotations.includes(rotation as 0 | 90 | 180 | 270)
  )
    return null
  const offsets = [first, second].map((row) =>
    rotatePinOffset(problem.chipPinMap[row.branch.bridgePin]!.offset, rotation),
  )
  const [bridgeA, bridgeB] = offsets as [Point, Point]
  if (
    Math.abs(dot(bridgeA, outward) - dot(bridgeB, outward)) > EPSILON ||
    dot(bridgeB, tangent) <= dot(bridgeA, tangent) + EPSILON
  )
    return null
  const farOuter = Math.max(
    ...[first, second].map(
      (row) =>
        row.normal +
        Math.max(
          halfExtent(row.branch.chip, row.rotation, outward),
          dot(row.far, outward),
        ),
    ),
  )
  const bridgeN =
    farOuter +
    problem.chipGap +
    Math.max(
      halfExtent(group.bridge, rotation, outward),
      -dot(bridgeA, outward),
    )
  const bridgeT =
    (first.transverse +
      dot(first.far, tangent) -
      dot(bridgeA, tangent) +
      (second.transverse + dot(second.far, tangent) - dot(bridgeB, tangent))) /
    2
  return {
    [first.branch.chip.chipId]: {
      ...world(first.normal, first.transverse),
      ccwRotationDegrees: first.rotation,
    },
    [second.branch.chip.chipId]: {
      ...world(second.normal, second.transverse),
      ccwRotationDegrees: second.rotation,
    },
    [group.bridge.chipId]: {
      ...world(bridgeN, bridgeT),
      ccwRotationDegrees: rotation,
    },
  }
}

const hasClearance = (
  problem: InputProblem,
  placements: OutputLayout["chipPlacements"],
  moved: Set<string>,
  partitionByChip: Map<string, number>,
): boolean => {
  const entries = Object.entries(placements)
  for (let i = 0; i < entries.length; i++)
    for (let j = i + 1; j < entries.length; j++) {
      const [a, first] = entries[i]!,
        [b, second] = entries[j]!
      if (!moved.has(a) && !moved.has(b)) continue
      const boundsA = getPlacementBounds({
        placement: first,
        size: problem.chipMap[a]!.size,
      })
      const boundsB = getPlacementBounds({
        placement: second,
        size: problem.chipMap[b]!.size,
      })
      const partitionA = partitionByChip.get(a)
      const samePartition =
        partitionA !== undefined &&
        partitionA >= 0 &&
        partitionA === partitionByChip.get(b)
      const minimumGap = samePartition
        ? problem.chipGap
        : Math.max(problem.chipGap, problem.partitionGap)
      if (
        boundsAreaOverlap(boundsA, boundsB) > EPSILON ||
        boundsDistance(boundsA, boundsB) < minimumGap - EPSILON
      )
        return false
    }
  return true
}

const geometry = (
  problem: InputProblem,
  placements: OutputLayout["chipPlacements"],
  edges: Edge[],
) => {
  const owners = createPinOwnerMap(problem)
  const segments = edges.map(([a, b]) => ({
    a: position(problem, placements, owners, a),
    b: position(problem, placements, owners, b),
  }))
  const obstructions = new Set<string>()
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i]!,
      segment = segments[i]!
    for (const [id, placement] of Object.entries(placements)) {
      if (id === owners.get(a)!.chipId || id === owners.get(b)!.chipId) continue
      if (
        doesSegmentIntersectRect(
          segment.a,
          segment.b,
          getPlacementBounds({ placement, size: problem.chipMap[id]!.size }),
        )
      )
        obstructions.add(`body:${i}:${id}`)
    }
    for (let j = i + 1; j < edges.length; j++) {
      if (edges[j]!.includes(a) || edges[j]!.includes(b)) continue
      if (
        doSegmentsIntersect(
          segment.a,
          segment.b,
          segments[j]!.a,
          segments[j]!.b,
        )
      )
        obstructions.add(`cross:${i}:${j}`)
    }
  }
  return {
    length: segments.reduce(
      (sum, segment) =>
        sum +
        Math.abs(segment.a.x - segment.b.x) +
        Math.abs(segment.a.y - segment.b.y),
      0,
    ),
    obstructions,
  }
}

/** Reflow paired passives jointly; reject blocked or longer candidates. */
export const alignBridgedPassivePairs = (
  problem: InputProblem,
  inputLayout: OutputLayout,
  partitions: PartitionMembership,
): OutputLayout => {
  const output = structuredClone(inputLayout)
  const partitionByChip = new Map<string, number>()
  partitions.forEach((partition, index) => {
    for (const id of Object.keys(partition.chipMap)) {
      partitionByChip.set(id, partitionByChip.has(id) ? -1 : index)
    }
  })
  const owners = createPinOwnerMap(problem)
  const edges: Edge[] = []
  for (const [a, pins] of Object.entries(
    getPinIdToStronglyConnectedPinsObj(problem),
  ))
    for (const pin of pins) {
      const first = owners.get(a),
        second = owners.get(pin.pinId)
      if (
        a < pin.pinId &&
        first &&
        second &&
        first !== second &&
        output.chipPlacements[first.chipId] &&
        output.chipPlacements[second.chipId]
      )
        edges.push([a, pin.pinId])
    }
  for (const group of findGroups(problem, edges)) {
    // This phase follows partition packing: only reflow a group wholly inside
    // one known partition, and retain the larger gap to external obstacles.
    const partition = partitionByChip.get(group.main.chipId)
    const members = [
      group.bridge.chipId,
      ...group.branches.map((branch) => branch.chip.chipId),
    ]
    if (
      partition === undefined ||
      partition < 0 ||
      members.some((id) => partitionByChip.get(id) !== partition)
    )
      continue
    const candidate = propose(problem, output.chipPlacements, group)
    if (!candidate) continue
    const placements = { ...output.chipPlacements, ...candidate }
    if (
      !hasClearance(
        problem,
        placements,
        new Set(Object.keys(candidate)),
        partitionByChip,
      )
    )
      continue
    const before = geometry(problem, output.chipPlacements, edges),
      after = geometry(problem, placements, edges)
    if (
      after.length >= before.length - EPSILON ||
      [...after.obstructions].some((key) => !before.obstructions.has(key))
    )
      continue
    output.chipPlacements = placements
  }
  return output
}
