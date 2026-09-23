import { expect, test } from "bun:test"
import { getInputProblemFromCircuitJsonSchematic as convert } from "../lib/testing/getInputProblemFromCircuitJsonSchematic"
import { getExampleCircuitJson } from "./assets/ExampleCircuit02"

test("duplicate component names preserve every chip and its pins", () => {
  const circuit = getExampleCircuitJson()
  const original = convert(circuit)
  for (const element of circuit) {
    if (element.type === "source_component") element.name = "shared"
  }
  const readable = convert(circuit, { useReadableIds: true })
  expect(Object.keys(readable.chipMap)).toHaveLength(
    Object.keys(original.chipMap).length,
  )
  expect(Object.keys(readable.chipPinMap)).toHaveLength(
    Object.keys(original.chipPinMap).length,
  )
  const ownedPins = Object.values(readable.chipMap).flatMap((chip) => chip.pins)
  expect(new Set(ownedPins).size).toBe(ownedPins.length)
  for (const pinId of ownedPins)
    expect(readable.chipPinMap[pinId]).toBeDefined()
  expect(Object.keys(readable.pinStrongConnMap)).toHaveLength(
    Object.keys(original.pinStrongConnMap).length,
  )
  expect(Object.keys(readable.netConnMap)).toHaveLength(
    Object.keys(original.netConnMap).length,
  )
  // Renaming display labels must not affect the default source-ID mode.
  expect(convert(circuit)).toEqual(original)
})

test("generated component suffixes do not steal a later component's name", () => {
  const circuit = getExampleCircuitJson()
  const components = circuit.filter(
    (element) => element.type === "source_component",
  )
  components[0]!.name = "shared"
  components[1]!.name = "shared"
  components[2]!.name = "shared_2"
  const third = circuit.find(
    (element) =>
      element.type === "schematic_component" &&
      element.source_component_id === components[2]!.source_component_id,
  )
  if (!third || third.type !== "schematic_component")
    throw new Error("Missing third component")
  third.size.width = 42
  const readable = convert(circuit, { useReadableIds: true })
  expect(Object.keys(readable.chipMap)).toHaveLength(components.length)
  expect(readable.chipMap.shared_2?.size.x).toBe(42)
  expect(readable.chipMap.shared).toBeDefined()
})

test("repeated pin names keep distinct offsets and connections", () => {
  const circuit = getExampleCircuitJson()
  const original = convert(circuit)
  const chip = circuit.find(
    (element) => element.type === "source_component" && element.name === "U1",
  )
  if (!chip || chip.type !== "source_component") throw new Error("Missing U1")
  const ports = circuit
    .filter((element) => element.type === "source_port")
    .filter(
      (element) => element.source_component_id === chip.source_component_id,
    )
  for (const [index, port] of ports.entries()) {
    port.pin_number = undefined
    port.name = index === 2 ? "signal_2" : "signal"
  }
  const readable = convert(circuit, { useReadableIds: true })
  expect(readable.chipMap.U1?.pins).toHaveLength(ports.length)
  expect(new Set(readable.chipMap.U1?.pins).size).toBe(ports.length)
  expect(Object.keys(readable.chipPinMap)).toHaveLength(
    Object.keys(original.chipPinMap).length,
  )
  expect(readable.chipPinMap["U1.signal_2"]?.offset).toEqual(
    original.chipPinMap[ports[2]!.source_port_id]?.offset,
  )
  expect(Object.keys(readable.pinStrongConnMap)).toHaveLength(
    Object.keys(original.pinStrongConnMap).length,
  )
})

test("distinct source nets with the same name remain distinct", () => {
  const circuit = getExampleCircuitJson()
  const original = convert(circuit)
  const nets = circuit.filter((element) => element.type === "source_net")
  expect(nets.length).toBeGreaterThan(1)
  for (const net of nets) net.name = "POWER"
  const readable = convert(circuit, { useReadableIds: true })
  expect(Object.keys(readable.netMap)).toHaveLength(nets.length)
  expect(Object.keys(readable.netConnMap)).toHaveLength(
    Object.keys(original.netConnMap).length,
  )
  const connectedNetIds = new Set(
    Object.keys(readable.netConnMap).map((key) => key.split("-")[1]),
  )
  expect(connectedNetIds.size).toBe(nets.length)
})
