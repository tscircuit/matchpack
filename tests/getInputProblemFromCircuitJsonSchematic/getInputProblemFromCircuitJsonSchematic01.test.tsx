import { test, expect } from "bun:test"
import { getExampleCircuitJson } from "../assets/ExampleCircuit01"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

test("getInputProblemFromCircuitJsonSchematic01", () => {
  const circuitJson = getExampleCircuitJson()

  console.log(circuitJson)

  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson)

  expect(problem).toMatchInlineSnapshot()
})
