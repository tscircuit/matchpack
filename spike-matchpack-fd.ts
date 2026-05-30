/**
 * SPIKE (throwaway): does force-directed packing win INSIDE matchpack's real
 * hierarchical pipeline (LayoutPipelineSolver), not just standalone?
 *
 *   bun spike-matchpack-fd.ts
 *
 * Generates N-resistor problems and runs the full LayoutPipelineSolver with the
 * stock greedy packer vs. the FD packer (env MATCHPACK_FD, hooked into the two
 * createPackInput sites). Reports end-to-end solve time, #chips placed, and
 * overlap count (rotation-aware AABB, same as the pipeline's own check).
 */
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { normalizeSide } from "lib/types/Side"

type Conn = "disconnected" | "series"

function makeResistors(n: number, conn: Conn): InputProblem {
  const chipMap: InputProblem["chipMap"] = {}
  const chipPinMap: InputProblem["chipPinMap"] = {}
  const netMap: InputProblem["netMap"] = {}
  const pinStrongConnMap: InputProblem["pinStrongConnMap"] = {}
  const netConnMap: InputProblem["netConnMap"] = {}

  for (let i = 0; i < n; i++) {
    const p1 = `P${i}_1`
    const p2 = `P${i}_2`
    chipMap[`R${i}`] = {
      chipId: `R${i}`,
      pins: [p1, p2],
      size: { x: 1, y: 0.4 },
      availableRotations: [0, 90, 180, 270],
    }
    chipPinMap[p1] = {
      pinId: p1,
      offset: { x: -0.5, y: 0 },
      side: normalizeSide("left"),
    }
    chipPinMap[p2] = {
      pinId: p2,
      offset: { x: 0.5, y: 0 },
      side: normalizeSide("right"),
    }
  }

  if (conn === "series") {
    // R(i).p2 strongly connected to R(i+1).p1
    for (let i = 0; i < n - 1; i++) {
      const a = `P${i}_2`
      const b = `P${i + 1}_1`
      pinStrongConnMap[`${a}-${b}`] = true
      pinStrongConnMap[`${b}-${a}`] = true
    }
  }

  return {
    chipMap,
    chipPinMap,
    netMap,
    pinStrongConnMap,
    netConnMap,
    chipGap: 0.2,
    partitionGap: 1,
  }
}

function rotatedSize(size: { x: number; y: number }, rot: number) {
  return rot === 90 || rot === 270
    ? { x: size.y, y: size.x }
    : { x: size.x, y: size.y }
}

function countOverlaps(
  problem: InputProblem,
  layout: any,
  gap: number,
): number {
  const ids = Object.keys(layout.chipPlacements)
  let count = 0
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = layout.chipPlacements[ids[i]!]!
      const b = layout.chipPlacements[ids[j]!]!
      const sa = rotatedSize(
        problem.chipMap[ids[i]!]!.size,
        a.ccwRotationDegrees || 0,
      )
      const sb = rotatedSize(
        problem.chipMap[ids[j]!]!.size,
        b.ccwRotationDegrees || 0,
      )
      const ox = (sa.x + sb.x) / 2 + gap - Math.abs(a.x - b.x)
      const oy = (sa.y + sb.y) / 2 + gap - Math.abs(a.y - b.y)
      if (ox > 1e-6 && oy > 1e-6) count++
    }
  }
  return count
}

function run(problem: InputProblem, useFD: boolean) {
  // Drive force-directed via the real InputProblem field (the plumbing), not
  // the old MATCHPACK_FD env hook.
  const prob = structuredClone(problem)
  if (useFD) prob.packPlacementStrategy = "force_directed"
  const solver = new LayoutPipelineSolver(prob)
  const t0 = performance.now()
  solver.solve()
  const ms = performance.now() - t0
  let layout: any
  let err: string | null = null
  try {
    layout = solver.getOutputLayout()
  } catch (e) {
    err = (e as Error).message
  }
  const placed = layout ? Object.keys(layout.chipPlacements).length : 0
  const overlaps = layout ? countOverlaps(problem, layout, problem.chipGap) : -1
  return { ms, placed, overlaps, failed: solver.failed, err }
}

const H = [
  "conn".padEnd(13),
  "n".padStart(4),
  "packer".padEnd(8),
  "solve(ms)".padStart(11),
  "placed".padStart(7),
  "overlaps".padStart(9),
  "status".padStart(8),
].join("  ")
console.log(H)
console.log("-".repeat(H.length))
for (const conn of ["disconnected", "series"] as Conn[]) {
  for (const n of [25, 50, 100]) {
    const problem = makeResistors(n, conn)
    for (const useFD of [false, true]) {
      const r = run(problem, useFD)
      const status = r.failed ? "FAILED" : r.err ? "ERR" : "ok"
      console.log(
        [
          conn.padEnd(13),
          String(n).padStart(4),
          (useFD ? "FD" : "greedy").padEnd(8),
          r.ms.toFixed(1).padStart(11),
          String(r.placed).padStart(7),
          String(r.overlaps).padStart(9),
          status.padStart(8),
        ].join("  "),
      )
    }
  }
}
