import { doesSegmentIntersectRect } from "@tscircuit/math-utils"
import type { Chip, InputProblem, PinId } from "../../types/InputProblem"
import type { OutputLayout, Placement } from "../../types/OutputLayout"
import { getRotatedSize, rotatePinOffset } from "../../utils/rotatePinOffset"

type Point = { x: number; y: number }
type Bounds = { minX: number; maxX: number; minY: number; maxY: number }
type Edge = [PinId, PinId]
type Branch = {
  chip: Chip
  nearPin: PinId
  farPin: PinId
  mainPin: PinId
  terminalPin: PinId
}
const EPSILON = 1e-6
// The generic packer represents pin pads as 0.1-wide squares.
const PIN_HALF_SIZE = 0.05
const ROTATIONS = [0, 90, 180, 270] as const
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x
const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })

/** Only actual pin-to-pin edges participate; legacy pin-to-net entries do not. */
const getEdges = (problem: InputProblem): Edge[] => {
  const edges: Edge[] = []
  const seen = new Set<string>()
  for (const [key, connected] of Object.entries(problem.pinStrongConnMap)) {
    if (!connected) continue
    const [a, b] = key.split("-")
    if (!a || !b || !problem.chipPinMap[a] || !problem.chipPinMap[b]) continue
    const canonical = [a, b].sort().join("\u0000")
    if (seen.has(canonical)) continue
    seen.add(canonical)
    edges.push([a, b])
  }
  return edges
}

const getBounds = (
  problem: InputProblem,
  chip: Chip,
  placement: Placement,
): Bounds => {
  const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
  const bounds = {
    minX: -size.x / 2,
    maxX: size.x / 2,
    minY: -size.y / 2,
    maxY: size.y / 2,
  }
  for (const pinId of chip.pins) {
    const pin = problem.chipPinMap[pinId]
    if (!pin) continue
    const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
    bounds.minX = Math.min(bounds.minX, offset.x - PIN_HALF_SIZE)
    bounds.maxX = Math.max(bounds.maxX, offset.x + PIN_HALF_SIZE)
    bounds.minY = Math.min(bounds.minY, offset.y - PIN_HALF_SIZE)
    bounds.maxY = Math.max(bounds.maxY, offset.y + PIN_HALF_SIZE)
  }
  return {
    minX: bounds.minX + placement.x,
    maxX: bounds.maxX + placement.x,
    minY: bounds.minY + placement.y,
    maxY: bounds.maxY + placement.y,
  }
}

const projectBounds = (bounds: Bounds, axis: Point) => {
  const coordinates = [
    dot({ x: bounds.minX, y: bounds.minY }, axis),
    dot({ x: bounds.maxX, y: bounds.maxY }, axis),
  ]
  return { min: Math.min(...coordinates), max: Math.max(...coordinates) }
}

const hasClearance = (
  problem: InputProblem,
  placements: Record<string, Placement>,
  movedIds: Set<string>,
): boolean => {
  const entries = Object.entries(placements)
  for (let i = 0; i < entries.length; i++) {
    const [id, placement] = entries[i]!
    for (let j = i + 1; j < entries.length; j++) {
      const [otherId, otherPlacement] = entries[j]!
      if (!movedIds.has(id) && !movedIds.has(otherId)) continue
      const chip = problem.chipMap[id]
      const otherChip = problem.chipMap[otherId]
      if (!chip || !otherChip) return false
      const a = getBounds(problem, chip, placement)
      const b = getBounds(problem, otherChip, otherPlacement)
      // A zero requested gap permits touching, never intersecting envelopes.
      if (
        Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > EPSILON &&
        Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) > EPSILON
      )
        return false
      const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX)
      const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY)
      if (Math.hypot(dx, dy) < problem.chipGap - EPSILON) return false
    }
  }
  return true
}

/** Record crossed edge pairs, excluding legitimate shared endpoint junctions. */
const crossingPairs = (
  edges: Edge[],
  positions: Map<PinId, Point>,
): Set<string> => {
  const crossings = new Set<string>()
  for (let i = 0; i < edges.length; i++) {
    const first = edges[i]!
    for (let j = i + 1; j < edges.length; j++) {
      const second = edges[j]!
      if (first.some((id) => second.includes(id))) continue
      const a = positions.get(first[0])
      const b = positions.get(first[1])
      const c = positions.get(second[0])
      const d = positions.get(second[1])
      if (!a || !b || !c || !d) continue
      const ab = subtract(b, a)
      const cd = subtract(d, c)
      if (
        cross(ab, subtract(c, a)) * cross(ab, subtract(d, a)) < -EPSILON &&
        cross(cd, subtract(a, c)) * cross(cd, subtract(b, c)) < -EPSILON
      )
        crossings.add(`${i}:${j}`)
    }
  }
  return crossings
}

/** Straight connections must not acquire a new obstruction through a third body. */
const obstructedEdgeBodyPairs = (
  problem: InputProblem,
  edges: Edge[],
  positions: Map<PinId, Point>,
  placements: Record<string, Placement>,
  owners: Map<PinId, Chip>,
): Set<string> => {
  const obstructions = new Set<string>()
  for (let index = 0; index < edges.length; index++) {
    const [a, b] = edges[index]!
    const start = positions.get(a)
    const end = positions.get(b)
    if (!start || !end) continue
    for (const chip of Object.values(problem.chipMap)) {
      if (chip === owners.get(a) || chip === owners.get(b)) continue
      const placement = placements[chip.chipId]
      if (!placement) continue
      const size = getRotatedSize(chip.size, placement.ccwRotationDegrees)
      // Slightly inset the body so a tangential edge contact is not counted.
      const halfWidth = size.x / 2 - EPSILON
      const halfHeight = size.y / 2 - EPSILON
      if (halfWidth <= 0 || halfHeight <= 0) continue
      if (
        doesSegmentIntersectRect(start, end, {
          minX: placement.x - halfWidth,
          maxX: placement.x + halfWidth,
          minY: placement.y - halfHeight,
          maxY: placement.y + halfHeight,
        })
      )
        obstructions.add(`${index}:${chip.chipId}`)
    }
  }
  return obstructions
}

const pinPositions = (
  problem: InputProblem,
  placements: Record<string, Placement>,
) => {
  const positions = new Map<PinId, Point>()
  for (const chip of Object.values(problem.chipMap)) {
    const placement = placements[chip.chipId]
    if (!placement) continue
    for (const id of chip.pins) {
      const pin = problem.chipPinMap[id]
      if (!pin) continue
      const offset = rotatePinOffset(pin.offset, placement.ccwRotationDegrees)
      positions.set(id, {
        x: placement.x + offset.x,
        y: placement.y + offset.y,
      })
    }
  }
  return positions
}

const edgeLength = (edges: Edge[], positions: Map<PinId, Point>) =>
  edges.reduce((sum, [a, b]) => {
    const first = positions.get(a)
    const second = positions.get(b)
    return !first || !second
      ? sum
      : sum + Math.abs(first.x - second.x) + Math.abs(first.y - second.y)
  }, 0)

/**
 * Reflow two separate two-pin branches from one chip face to distinct pins of
 * a shared three-pin terminal. This is not an arbitrary graph optimization:
 * branched paths, fixed members and unsuitable pin geometries keep the packed
 * layout. The main chip and every component outside the detected motif stay put.
 */
export const refineSharedTerminalBranches = ({
  inputProblem: problem,
  inputLayout,
}: {
  inputProblem: InputProblem
  inputLayout: OutputLayout
}): OutputLayout => {
  const edges = getEdges(problem)
  const owners = new Map<PinId, Chip>()
  for (const chip of Object.values(problem.chipMap)) {
    for (const pin of chip.pins) owners.set(pin, chip)
  }
  const connections = (chip: Chip) =>
    edges.flatMap(([a, b]) => {
      if (owners.get(a) === chip && owners.get(b) !== chip)
        return [{ self: a, other: b }]
      if (owners.get(b) === chip && owners.get(a) !== chip)
        return [{ self: b, other: a }]
      return []
    })
  let placements = { ...inputLayout.chipPlacements }
  const handled = new Set<string>()
  for (const terminal of Object.values(problem.chipMap)) {
    if (
      terminal.pins.length !== 3 ||
      terminal.fixedPosition ||
      handled.has(terminal.chipId)
    )
      continue
    const terminalConnections = connections(terminal)
    if (
      terminalConnections.length !== 2 ||
      terminalConnections[0]!.self === terminalConnections[1]!.self
    )
      continue
    const branches: Branch[] = []
    let main: Chip | undefined
    for (const terminalConnection of terminalConnections) {
      const chip = owners.get(terminalConnection.other)
      if (
        chip?.pins.length !== 2 ||
        chip.fixedPosition ||
        handled.has(chip.chipId)
      )
        break
      const branchConnections = connections(chip)
      if (branchConnections.length !== 2) break
      const mainConnection = branchConnections.find(
        (connection) => owners.get(connection.other) !== terminal,
      )
      if (!mainConnection || mainConnection.self === terminalConnection.other)
        break
      const anchor = owners.get(mainConnection.other)
      if (!anchor || anchor.pins.length <= 2 || (main && main !== anchor)) break
      main = anchor
      branches.push({
        chip,
        nearPin: mainConnection.self,
        farPin: terminalConnection.other,
        mainPin: mainConnection.other,
        terminalPin: terminalConnection.self,
      })
    }
    if (
      !main ||
      branches.length !== 2 ||
      branches[0]!.chip === branches[1]!.chip ||
      branches[0]!.mainPin === branches[1]!.mainPin
    )
      continue
    const mainPlacement = placements[main.chipId]
    const mainPin = problem.chipPinMap[branches[0]!.mainPin]
    const otherMainPin = problem.chipPinMap[branches[1]!.mainPin]
    if (
      !mainPlacement ||
      !mainPin ||
      !otherMainPin ||
      mainPin.side !== otherMainPin.side
    )
      continue
    const sideDirections = {
      "x+": { x: 1, y: 0 },
      "x-": { x: -1, y: 0 },
      "y+": { x: 0, y: 1 },
      "y-": { x: 0, y: -1 },
    }
    // Side is authoritative even when a pin sits far along a tall/wide edge.
    const outward = rotatePinOffset(
      sideDirections[mainPin.side],
      mainPlacement.ccwRotationDegrees,
    )
    const tangent = { x: -outward.y, y: outward.x }
    const originalPositions = pinPositions(problem, placements)
    branches.sort(
      (a, b) =>
        dot(originalPositions.get(a.mainPin)!, tangent) -
        dot(originalPositions.get(b.mainPin)!, tangent),
    )
    const branchData = branches.map((branch) => {
      const nearPin = problem.chipPinMap[branch.nearPin]
      const farPin = problem.chipPinMap[branch.farPin]
      if (!nearPin || !farPin || !placements[branch.chip.chipId]) return null
      const rotation = (branch.chip.availableRotations ?? ROTATIONS).find(
        (rotation) => {
          const direction = subtract(
            rotatePinOffset(farPin.offset, rotation),
            rotatePinOffset(nearPin.offset, rotation),
          )
          return (
            dot(direction, outward) > EPSILON &&
            Math.abs(dot(direction, tangent)) < EPSILON
          )
        },
      )
      if (rotation === undefined) return null
      const nearOffset = rotatePinOffset(nearPin.offset, rotation)
      const farOffset = rotatePinOffset(farPin.offset, rotation)
      const bounds = getBounds(problem, branch.chip, {
        x: 0,
        y: 0,
        ccwRotationDegrees: rotation,
      })
      return { branch, rotation, nearOffset, farOffset, bounds }
    })
    if (branchData.some((data) => !data)) continue
    const data = branchData as NonNullable<(typeof branchData)[number]>[]
    const mainOut = projectBounds(
      getBounds(problem, main, mainPlacement),
      outward,
    ).max
    const nearOut =
      mainOut +
      problem.chipGap +
      Math.max(
        ...data.map(
          (d) =>
            dot(d.nearOffset, outward) - projectBounds(d.bounds, outward).min,
        ),
      )
    const tangentCenters = data.map(
      (d) =>
        dot(originalPositions.get(d.branch.mainPin)!, tangent) -
        dot(d.nearOffset, tangent),
    )
    const separation = Math.max(
      0,
      tangentCenters[0]! +
        projectBounds(data[0]!.bounds, tangent).max +
        problem.chipGap -
        tangentCenters[1]! -
        projectBounds(data[1]!.bounds, tangent).min,
    )
    tangentCenters[0]! -= separation / 2
    tangentCenters[1]! += separation / 2
    const branchPlacements: Record<string, Placement> = {}
    for (let index = 0; index < data.length; index++) {
      const d = data[index]!
      const o = nearOut - dot(d.nearOffset, outward)
      const t = tangentCenters[index]!
      branchPlacements[d.branch.chip.chipId] = {
        x: outward.x * o + tangent.x * t,
        y: outward.y * o + tangent.y * t,
        ccwRotationDegrees: d.rotation,
      }
    }
    const terminalPinOffsets = branches.map(
      (branch) => problem.chipPinMap[branch.terminalPin]?.offset,
    )
    if (
      !terminalPinOffsets[0] ||
      !terminalPinOffsets[1] ||
      !placements[terminal.chipId]
    )
      continue
    const movedIds = new Set([
      terminal.chipId,
      ...branches.map((branch) => branch.chip.chipId),
    ])
    let best = placements
    let bestLength = edgeLength(edges, originalPositions)
    const originalCrossings = crossingPairs(edges, originalPositions)
    const originalObstructions = obstructedEdgeBodyPairs(
      problem,
      edges,
      originalPositions,
      placements,
      owners,
    )
    for (const rotation of terminal.availableRotations ?? ROTATIONS) {
      const terminalOffsets = terminalPinOffsets.map((pin) =>
        rotatePinOffset(pin!, rotation),
      )
      if (
        dot(terminalOffsets[1]!, tangent) - dot(terminalOffsets[0]!, tangent) <
          EPSILON ||
        Math.abs(
          dot(subtract(terminalOffsets[1]!, terminalOffsets[0]!), outward),
        ) > EPSILON
      )
        continue
      const terminalBounds = getBounds(problem, terminal, {
        x: 0,
        y: 0,
        ccwRotationDegrees: rotation,
      })
      const outerBound = Math.max(
        ...data.map(
          (d) =>
            projectBounds(
              getBounds(
                problem,
                d.branch.chip,
                branchPlacements[d.branch.chip.chipId]!,
              ),
              outward,
            ).max,
        ),
      )
      const o =
        outerBound +
        problem.chipGap -
        projectBounds(terminalBounds, outward).min
      const t =
        data.reduce(
          (sum, d, index) =>
            sum +
            tangentCenters[index]! +
            dot(d.farOffset, tangent) -
            dot(terminalOffsets[index]!, tangent),
          0,
        ) / 2
      const candidate = {
        ...placements,
        ...branchPlacements,
        [terminal.chipId]: {
          x: outward.x * o + tangent.x * t,
          y: outward.y * o + tangent.y * t,
          ccwRotationDegrees: rotation,
        },
      }
      if (!hasClearance(problem, candidate, movedIds)) continue
      const positions = pinPositions(problem, candidate)
      const length = edgeLength(edges, positions)
      if (
        length >= bestLength - EPSILON ||
        [...crossingPairs(edges, positions)].some(
          (pair) => !originalCrossings.has(pair),
        ) ||
        [
          ...obstructedEdgeBodyPairs(
            problem,
            edges,
            positions,
            candidate,
            owners,
          ),
        ].some((pair) => !originalObstructions.has(pair))
      )
        continue
      best = candidate
      bestLength = length
    }
    if (best !== placements) {
      placements = best
      for (const id of movedIds) handled.add(id)
    }
  }
  return { ...inputLayout, chipPlacements: placements }
}
