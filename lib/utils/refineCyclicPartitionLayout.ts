import type { Point } from "@tscircuit/math-utils"
import type { ChipPin, InputProblem, PinId } from "../types/InputProblem"
import type { Placement } from "../types/OutputLayout"
import { createPinOwnerMap } from "./createPinOwnerMap"
import { rotatePinOffset } from "./rotatePinOffset"

type Placements = Record<string, Placement>
type Bounds = { minX: number; maxX: number; minY: number; maxY: number }
const NORMALS = {
  "x-": { x: -1, y: 0 },
  "x+": { x: 1, y: 0 },
  "y-": { x: 0, y: -1 },
  "y+": { x: 0, y: 1 },
}
const EPSILON = 1e-8

/**
 * A bounded, deterministic search for small cyclic fallback partitions. Greedy
 * packing can trap a cycle with its closing component on the wrong side of the
 * anchor. Temporarily accepting longer connections lets the whole cycle move.
 * Specialized semantic layout strategies never enter this fallback refinement.
 */
export function refineCyclicPartitionLayout({
  inputProblem: problem,
  connectedPinsByPinId,
  chipPlacements: initial,
}: {
  inputProblem: InputProblem
  connectedPinsByPinId: Record<PinId, ChipPin[]>
  chipPlacements: Placements
}): Placements {
  const ids = Object.keys(problem.chipMap)
  if (ids.length < 3 || ids.length > 6) return initial
  const owners = createPinOwnerMap(problem)
  const edges: [PinId, PinId][] = []
  for (const [pin, connected] of Object.entries(connectedPinsByPinId)) {
    if (!owners.has(pin)) continue
    for (const other of connected) {
      if (pin >= other.pinId || !owners.has(other.pinId)) continue
      if (owners.get(pin) === owners.get(other.pinId)) continue
      edges.push([pin, other.pinId])
    }
  }
  // Count chip-to-chip edges rather than pin pairs: several pins between the
  // same two components do not form a placement cycle.
  const adjacency = new Map(ids.map((id) => [id, new Set<string>()]))
  for (const [a, b] of edges) {
    const first = owners.get(a)!.chipId
    const second = owners.get(b)!.chipId
    adjacency.get(first)!.add(second)
    adjacency.get(second)!.add(first)
  }
  const visited = new Set<string>()
  const hasCycle = (id: string, parent?: string): boolean => {
    visited.add(id)
    for (const other of adjacency.get(id)!) {
      if (other === parent) continue
      if (visited.has(other) || hasCycle(other, id)) return true
    }
    return false
  }
  if (!ids.some((id) => !visited.has(id) && hasCycle(id))) return initial

  // Match PackSolver2's pin pads and its centered body pad, including pins
  // outside the symbol body and asymmetric pin arrangements.
  const localBounds = new Map<string, Bounds>()
  for (const id of ids) {
    const chip = problem.chipMap[id]!
    const pins = chip.pins.map((pin) => problem.chipPinMap[pin]!.offset)
    const minX = Math.min(...pins.map((pin) => pin.x - 0.05))
    const maxX = Math.max(...pins.map((pin) => pin.x + 0.05))
    const minY = Math.min(...pins.map((pin) => pin.y - 0.05))
    const maxY = Math.max(...pins.map((pin) => pin.y + 0.05))
    const width = Math.max(chip.size.x, maxX - minX)
    const height = Math.max(chip.size.y, maxY - minY)
    localBounds.set(id, {
      minX: Math.min(minX, -width / 2),
      maxX: Math.max(maxX, width / 2),
      minY: Math.min(minY, -height / 2),
      maxY: Math.max(maxY, height / 2),
    })
  }
  const bounds = (id: string, placement: Placement): Bounds => {
    const b = localBounds.get(id)!
    const corners = [
      { x: b.minX, y: b.minY },
      { x: b.maxX, y: b.maxY },
      { x: b.minX, y: b.maxY },
      { x: b.maxX, y: b.minY },
    ].map((p) => rotatePinOffset(p, placement.ccwRotationDegrees))
    return {
      minX: placement.x + Math.min(...corners.map((p) => p.x)),
      maxX: placement.x + Math.max(...corners.map((p) => p.x)),
      minY: placement.y + Math.min(...corners.map((p) => p.y)),
      maxY: placement.y + Math.max(...corners.map((p) => p.y)),
    }
  }
  const fits = (id: string, placement: Placement, layout: Placements) => {
    const a = bounds(id, placement)
    return ids.every((other) => {
      if (other === id) return true
      const b = bounds(other, layout[other]!)
      return (
        Math.max(
          b.minX - a.maxX,
          a.minX - b.maxX,
          b.minY - a.maxY,
          a.minY - b.maxY,
        ) >=
        problem.chipGap - EPSILON
      )
    })
  }
  if (!ids.every((id) => fits(id, initial[id]!, initial))) return initial
  const pinPoint = (pin: PinId, layout: Placements): Point => {
    const placement = layout[owners.get(pin)!.chipId]!
    const offset = rotatePinOffset(
      problem.chipPinMap[pin]!.offset,
      placement.ccwRotationDegrees,
    )
    return { x: placement.x + offset.x, y: placement.y + offset.y }
  }
  // Reserve an outward stub so shortening a connection by turning a pin away
  // from its destination is not mistaken for an improvement.
  const score = (layout: Placements) =>
    edges.reduce((sum, [a, b]) => {
      const first = pinPoint(a, layout)
      const second = pinPoint(b, layout)
      const normal = (pin: PinId) =>
        rotatePinOffset(
          NORMALS[problem.chipPinMap[pin]!.side],
          layout[owners.get(pin)!.chipId]!.ccwRotationDegrees,
        )
      const n = normal(a)
      const m = normal(b)
      const stub = problem.chipGap / 2
      return (
        sum +
        2 * stub +
        Math.abs(first.x + stub * n.x - second.x - stub * m.x) +
        Math.abs(first.y + stub * n.y - second.y - stub * m.y)
      )
    }, 0)
  const orientation = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  const crossings = (layout: Placements) => {
    let count = 0
    const segments = edges.map(
      ([a, b]) => [pinPoint(a, layout), pinPoint(b, layout)] as const,
    )
    for (let i = 0; i < segments.length; i++) {
      const [a, b] = segments[i]!
      for (const [c, d] of segments.slice(i + 1)) {
        if (
          orientation(a, b, c) * orientation(a, b, d) < -EPSILON &&
          orientation(c, d, a) * orientation(c, d, b) < -EPSILON
        )
          count++
      }
    }
    return count
  }
  // This is a placement heuristic, not a router. Reject added straight-line
  // obstructions as well as crossings; actual routing still belongs downstream.
  const obstructions = (layout: Placements) => {
    let count = 0
    for (const [first, second] of edges) {
      const a = pinPoint(first, layout)
      const b = pinPoint(second, layout)
      for (const id of ids) {
        if (
          id === owners.get(first)!.chipId ||
          id === owners.get(second)!.chipId
        )
          continue
        const box = bounds(id, layout[id]!)
        let enter = 0
        let exit = 1
        for (const [start, end, min, max] of [
          [a.x, b.x, box.minX + EPSILON, box.maxX - EPSILON],
          [a.y, b.y, box.minY + EPSILON, box.maxY - EPSILON],
        ] as const) {
          const delta = end - start
          if (Math.abs(delta) < EPSILON) {
            if (start < min || start > max) exit = -1
          } else {
            const first = (min - start) / delta
            const second = (max - start) / delta
            enter = Math.max(enter, Math.min(first, second))
            exit = Math.min(exit, Math.max(first, second))
          }
        }
        if (enter < exit) count++
      }
    }
    return count
  }
  const initialObstructions = obstructions(initial)
  const initialCrossings = crossings(initial)
  // Keep the largest symbol in place. Explicitly fixed components also remain
  // untouched, including their original rotation.
  const anchor = ids.reduce((a, b) => {
    const first = problem.chipMap[a]!.size
    const second = problem.chipMap[b]!.size
    return first.x * first.y >= second.x * second.y ? a : b
  })
  // Peel tree branches away from the cycle; their existing placement is not
  // responsible for the closing-edge problem and should remain unchanged.
  const cyclicIds = new Set(ids)
  let removed = true
  while (removed) {
    removed = false
    for (const id of cyclicIds) {
      if (
        [...adjacency.get(id)!].filter((other) => cyclicIds.has(other)).length <
        2
      ) {
        cyclicIds.delete(id)
        removed = true
      }
    }
  }
  const movable = ids.filter(
    (id) =>
      cyclicIds.has(id) && id !== anchor && !problem.chipMap[id]!.fixedPosition,
  )
  if (!movable.length) return initial
  let seed = 17
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!
  let current = { layout: initial, score: score(initial) }
  let best = current
  for (let iteration = 0; iteration < 30000; iteration++) {
    if (iteration > 0 && iteration % 5000 === 0) current = best
    const id = pick(movable)
    const rotation = pick(
      problem.chipMap[id]!.availableRotations ?? [0, 90, 180, 270],
    )
    const box = bounds(id, { x: 0, y: 0, ccwRotationDegrees: rotation })
    const xs = [current.layout[id]!.x]
    const ys = [current.layout[id]!.y]
    for (const other of ids) {
      if (other === id) continue
      const otherBox = bounds(other, current.layout[other]!)
      xs.push(
        otherBox.minX - problem.chipGap - box.maxX,
        otherBox.maxX + problem.chipGap - box.minX,
      )
      ys.push(
        otherBox.minY - problem.chipGap - box.maxY,
        otherBox.maxY + problem.chipGap - box.minY,
      )
    }
    for (const [a, b] of edges) {
      const own =
        owners.get(a)!.chipId === id
          ? a
          : owners.get(b)!.chipId === id
            ? b
            : null
      if (!own) continue
      const other = pinPoint(own === a ? b : a, current.layout)
      const offset = rotatePinOffset(problem.chipPinMap[own]!.offset, rotation)
      xs.push(other.x - offset.x)
      ys.push(other.y - offset.y)
    }
    const placement = { x: pick(xs), y: pick(ys), ccwRotationDegrees: rotation }
    if (!fits(id, placement, current.layout)) continue
    const layout = { ...current.layout, [id]: placement }
    const candidateScore = score(layout)
    const temperature = 2 * problem.chipGap * (1 - (iteration % 5000) / 5000)
    if (
      candidateScore < current.score ||
      random() < Math.exp((current.score - candidateScore) / temperature)
    ) {
      current = { layout, score: candidateScore }
    }
    if (
      candidateScore < best.score - EPSILON &&
      crossings(layout) <= initialCrossings &&
      obstructions(layout) <= initialObstructions
    ) {
      best = { layout, score: candidateScore }
    }
  }
  return best.layout
}
