import { expect, test } from "bun:test"
import type { InputProblem } from "../lib/types/InputProblem"
import { getPinIdToStronglyConnectedPinsObj } from "../lib/solvers/LayoutPipelineSolver/getPinIdToStronglyConnectedPinsObj"
import { createFilteredNetworkMapping } from "../lib/utils/networkFiltering"

const makeProblem = (edges: [string, string][]): InputProblem => {
  const problem: InputProblem = {
    chipMap: {},
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  }
  for (const [a, b] of edges) {
    for (const pinId of [a, b]) {
      problem.chipPinMap[pinId] = { pinId, offset: { x: 0, y: 0 }, side: "x+" }
    }
    problem.pinStrongConnMap[`${a}-${b}`] = true
    problem.pinStrongConnMap[`${b}-${a}`] = true
  }
  return problem
}

const getNetworks = (problem: InputProblem) =>
  createFilteredNetworkMapping({
    inputProblem: problem,
    pinIdToStronglyConnectedPins: getPinIdToStronglyConnectedPinsObj(problem),
  })

test("a late bridge joins every pin in both existing strong networks", () => {
  const problem = makeProblem([
    ["A.1", "B.1"],
    ["C.1", "D.1"],
    ["B.1", "C.1"],
  ])
  const { pinToNetworkMap } = getNetworks(problem)
  expect(pinToNetworkMap.size).toBe(4)
  expect(new Set(pinToNetworkMap.values()).size).toBe(1)
})

test("strong network membership is independent of bridge insertion order", () => {
  const edges: [string, string][] = [
    ["A.1", "B.1"],
    ["C.1", "D.1"],
    ["B.1", "C.1"],
  ]
  for (const order of [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ]) {
    const problem = makeProblem(order.map((index) => edges[index]!))
    const { pinToNetworkMap } = getNetworks(problem)
    expect(new Set(pinToNetworkMap.values()).size).toBe(1)
  }
})

test("transitive merges preserve disconnected groups and weak-pin filtering", () => {
  const problem = makeProblem([
    ["A.1", "B.1"],
    ["C.1", "D.1"],
    ["E.1", "F.1"],
    ["G.1", "H.1"],
    ["B.1", "C.1"],
    ["F.1", "G.1"],
    ["D.1", "E.1"],
    ["J.1", "K.1"],
  ])
  problem.pinStrongConnMap["H.1-J.1"] = false
  problem.netMap.VCC = { netId: "VCC" }
  problem.netConnMap["A.1-VCC"] = true
  problem.netConnMap["J.1-VCC"] = true
  const { pinToNetworkMap, filteredPins } = getNetworks(problem)
  expect(new Set(pinToNetworkMap.values()).size).toBe(2)
  for (const pinId of ["B.1", "C.1", "D.1", "E.1", "F.1", "G.1", "H.1"]) {
    expect(pinToNetworkMap.get(pinId)).toBe(pinToNetworkMap.get("A.1"))
  }
  expect(pinToNetworkMap.get("J.1")).toBe(pinToNetworkMap.get("K.1"))
  expect(pinToNetworkMap.get("J.1")).not.toBe(pinToNetworkMap.get("A.1"))
  expect(filteredPins).toEqual(new Set(["A.1", "J.1"]))
})
