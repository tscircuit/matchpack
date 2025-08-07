import type { InputProblem } from "lib/types/InputProblem"
import type { CircuitJson } from "circuit-json"
import { cju } from "@tscircuit/circuit-json-util"

export const getInputProblemFromCircuitJsonSchematic = (
  circuitJson: CircuitJson,
): InputProblem => {
  const db = cju(circuitJson)

  const problem: InputProblem = {
    chipMap: {},
    chipPinMap: {},
    groupMap: {},
    groupPinMap: {},
    netMap: {},
    pinConnMap: {},
    netConnMap: {},
  }

  const cjChips = db.schematic_component.list().map((schematic_component) => ({
    schematic_component,
    source_component: db.source_component.get(
      schematic_component.source_component_id,
    ),
    ports: db.schematic_port
      .list({
        schematic_component_id: schematic_component.schematic_component_id,
      })
      .map((schematic_port) => ({
        schematic_port,
        source_port: db.source_port.get(schematic_port.source_port_id),
      })),
  }))

  const cjSourceTraces = db.source_trace.list()
  const cjSourceNets = db.source_net.list()

  // Go through circuit json, pull out source_component/schematic_component as chip
  // ignore groups
  // find source_net and pin to pin connections via source_traces

  return problem
}
