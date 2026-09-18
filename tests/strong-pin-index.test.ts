import { test } from "bun:test"
import { strict as assert } from "node:assert"
import type { InputProblem } from "../lib/types/InputProblem"
import { getPinIdToStronglyConnectedPinsObj as collect } from "../lib/solvers/LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"

const problem = (
  ids: string[],
  connections: Record<`${string}-${string}`, boolean>,
): InputProblem => ({
  chipMap: Object.fromEntries(
    ids.map((id) => [id, { chipId: id, pins: [id], size: { x: 1, y: 1 } }]),
  ),
  chipPinMap: Object.fromEntries(
    ids.map((pinId) => [
      pinId,
      { pinId, offset: { x: 0, y: 0 }, side: "left" },
    ]),
  ),
  pinStrongConnMap: connections,
  netMap: {},
  netConnMap: {},
  chipGap: 1,
  partitionGap: 1,
})

const summarize = (input: InputProblem) =>
  Object.entries(collect(input)).map(([id, pins]) => [
    id,
    pins.map((p) => p.pinId),
  ])

test("strong neighbors keep pin order rather than connection-key order", () => {
  const input = problem(["U1.1", "R1.1", "C1.1", "U2.1"], {
    "C1.1-U2.1": true,
    "R1.1-U1.1": true,
    "U1.1-R1.1": true,
    "U1.1-U2.1": true,
  })
  assert.deepEqual(summarize(input), [
    ["U1.1", ["R1.1", "U2.1"]],
    ["R1.1", ["U1.1"]],
    ["U2.1", ["U1.1", "C1.1"]],
    ["C1.1", ["U2.1"]],
  ])
  assert.equal(collect(input)["U1.1"]![0], input.chipPinMap["R1.1"])
})

test("ambiguous hyphen splits retain all originally matched pairs", () => {
  assert.deepEqual(
    summarize(problem(["a", "b-c", "a-b", "c"], { "a-b-c": true })),
    [
      ["a", ["b-c"]],
      ["b-c", ["a"]],
      ["a-b", ["c"]],
      ["c", ["a-b"]],
    ],
  )
})

test("disabled, dangling, and self edges do not create neighbors", () => {
  const input = problem(["a", "b"], {
    "a-b": false,
    "a-a": true,
    "a-missing": true,
  })
  const snapshot = JSON.stringify(input)
  assert.deepEqual(collect(input), {})
  assert.equal(JSON.stringify(input), snapshot)
})

test("sparse pairs retain every connection without adding transitive edges", () => {
  const ids = Array.from({ length: 1500 }, (_, i) => `pin${i}`)
  const connections: Record<`${string}-${string}`, boolean> = {}
  for (let i = 0; i < ids.length; i += 2) {
    connections[`${ids[i]}-${ids[i + 1]}`] = true
  }
  const input = problem(ids, connections)
  const result = collect(input)
  assert.equal(Object.keys(result).length, ids.length)
  for (let i = 0; i < ids.length; i++) {
    assert.deepEqual(result[ids[i]!]!.map((p) => p.pinId), [ids[i ^ 1]])
  }
})
