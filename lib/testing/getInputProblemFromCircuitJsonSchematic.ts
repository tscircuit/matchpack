import type { InputProblem } from "lib/types/InputProblem"
import type { CircuitJson } from "circuit-json"

export const getInputProblemFromCircuitJsonSchematic = (
  circuitJson: CircuitJson,
): InputProblem => {
  const problem: InputProblem = {
    chipMap: {},
    chipPinMap: {},
    groupMap: {},
    groupPinMap: {},
    netMap: {},
    pinConnMap: {},
    netConnMap: {},
  }

  // Go through circuit json, pull out source_component/schematic_component as chip
  // ignore groups
  // find source_net and pin to pin connections via source_traces

  return problem
}
