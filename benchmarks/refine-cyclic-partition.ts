// Run with: bun benchmarks/refine-cyclic-partition.ts
// Measures refinement alone using the original SI7021 packer's rounded output.
// Five warmups, then twenty samples; timings are not a cross-machine guarantee.
import type { ChipPin, InputProblem } from "../lib/types/InputProblem"
import type { Placement } from "../lib/types/OutputLayout"
import { refineCyclicPartitionLayout } from "../lib/utils/refineCyclicPartitionLayout"
import { rotatePinOffset } from "../lib/utils/rotatePinOffset"
import fixture from "../pages/repros/repro-si7021/si7021-matchpack-input.json"

const problem = fixture as unknown as InputProblem
const initial: Record<string, Placement> = {
  U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
  SJ1: { x: 0.025, y: -1.15, ccwRotationDegrees: 90 },
  R2: { x: 1.025, y: -1.35, ccwRotationDegrees: 0 },
  R1: { x: 1.7, y: 0.15, ccwRotationDegrees: 0 },
  C2: { x: -2.03, y: 0, ccwRotationDegrees: 90 },
}
const pins = Object.values(problem.chipPinMap)
const connectedPinsByPinId = Object.fromEntries(
  pins.map((a) => [
    a.pinId,
    pins.filter(
      (b) =>
        problem.pinStrongConnMap[`${a.pinId}-${b.pinId}`] ||
        problem.pinStrongConnMap[`${b.pinId}-${a.pinId}`],
    ),
  ]),
)
const owners = Object.fromEntries(
  Object.values(problem.chipMap).flatMap((chip) =>
    chip.pins.map((pin) => [pin, chip.chipId]),
  ),
)
const edges: [ChipPin, ChipPin][] = pins.flatMap((a, i) =>
  pins
    .slice(i + 1)
    .filter((b) => connectedPinsByPinId[a.pinId]!.includes(b))
    .map((b): [ChipPin, ChipPin] => [a, b]),
)
const normals = {
  "x-": { x: -1, y: 0 },
  "x+": { x: 1, y: 0 },
  "y-": { x: 0, y: -1 },
  "y+": { x: 0, y: 1 },
}
function measure(layout: Record<string, Placement>) {
  const lengths: number[] = []
  const stubLengths: number[] = []
  for (const [a, b] of edges) {
    const first = layout[owners[a.pinId]!]!
    const second = layout[owners[b.pinId]!]!
    const firstOffset = rotatePinOffset(a.offset, first.ccwRotationDegrees)
    const secondOffset = rotatePinOffset(b.offset, second.ccwRotationDegrees)
    const firstNormal = rotatePinOffset(
      normals[a.side],
      first.ccwRotationDegrees,
    )
    const secondNormal = rotatePinOffset(
      normals[b.side],
      second.ccwRotationDegrees,
    )
    const dx = first.x + firstOffset.x - second.x - secondOffset.x
    const dy = first.y + firstOffset.y - second.y - secondOffset.y
    lengths.push(Math.abs(dx) + Math.abs(dy))
    const stub = problem.chipGap / 2
    stubLengths.push(
      2 * stub +
        Math.abs(dx + stub * (firstNormal.x - secondNormal.x)) +
        Math.abs(dy + stub * (firstNormal.y - secondNormal.y)),
    )
  }
  return {
    wireLength: lengths.reduce((sum, length) => sum + length, 0),
    stubLength: stubLengths.reduce((sum, length) => sum + length, 0),
    longestWire: Math.max(...lengths),
  }
}
const times: number[] = []
let output: Record<string, Placement> | undefined
for (let iteration = 0; iteration < 25; iteration++) {
  const start = performance.now()
  const result = refineCyclicPartitionLayout({
    inputProblem: problem,
    connectedPinsByPinId,
    chipPlacements: initial,
  })
  const elapsed = performance.now() - start
  if (iteration >= 5) times.push(elapsed)
  if (output && JSON.stringify(output) !== JSON.stringify(result))
    throw new Error("Non-deterministic refinement result")
  output = result
}
times.sort((a, b) => a - b)
console.log(
  JSON.stringify(
    {
      runtime: Bun.version,
      samples: times.length,
      medianMs: (times[9]! + times[10]!) / 2,
      minMs: times[0],
      maxMs: times.at(-1),
      before: measure(initial),
      after: measure(output!),
      placements: output,
    },
    null,
    2,
  ),
)
