import { RootCircuit } from "tscircuit"

export default () => {
  const circuit = new RootCircuit()

  circuit.add(
    <board>
      <chip
        name="U1"
        connections={{
          VCC: "net.V3_3",
          GND: "net.GND",
        }}
      />
      <capacitor
        name="C1"
        capacitance="0.1uF"
        connections={{
          pin1: "net.V3_3",
          pin2: "net.GND",
        }}
      />
      <capacitor
        name="C2"
        capacitance="10uF"
        connections={{
          pin1: "net.V3_3",
          pin2: "net.GND",
        }}
      />
      <resistor
        name="R1"
        resistance="10k"
        connections={{
          pin1: "net.V3_3",
          pin2: "net.SIGNAL",
        }}
      />
    </board>,
  )

  return <pre>{JSON.stringify(circuit.getCircuitJson(), null, 2)}</pre>
}
