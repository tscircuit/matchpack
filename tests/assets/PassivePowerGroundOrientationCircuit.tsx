import type { ChipProps } from "@tscircuit/props"
import { RootCircuit, sel } from "tscircuit"

const controllerPinLabels = {
  pin1: ["PULLUP"],
  pin2: ["PULLDOWN"],
  pin3: ["VDD"],
} as const

const Controller = (props: ChipProps<typeof controllerPinLabels>) => (
  <chip
    pinLabels={controllerPinLabels}
    manufacturerPartNumber="PASSIVE_POWER_GROUND_ORIENTATION_CONTROLLER"
    footprint="soic8"
    schPinArrangement={{
      leftSide: {
        direction: "top-to-bottom",
        pins: ["PULLUP", "PULLDOWN"],
      },
      topSide: {
        direction: "left-to-right",
        pins: ["VDD"],
      },
    }}
    {...props}
  />
)

export const ExampleCircuit = () => (
  <board width="10mm" height="10mm" routingDisabled>
    <Controller
      name="U1"
      connections={{
        VDD: "net.VSYS",
      }}
    />

    <resistor
      name="R_PULLUP"
      resistance="10k"
      footprint="0402"
      connections={{
        pin1: "net.VSYS",
        pin2: "U1.PULLUP",
      }}
    />

    <resistor
      name="R_PULLDOWN"
      resistance="10k"
      footprint="0402"
      connections={{
        pin1: "U1.PULLDOWN",
        pin2: sel.net.GND,
      }}
    />

    <capacitor
      name="C_DECOUPLE"
      capacitance="0.1uF"
      footprint="0402"
      connections={{
        pin1: "net.VSYS",
        pin2: sel.net.GND,
      }}
    />

    <diode
      name="D_POWER"
      footprint="0603"
      connections={{
        pin1: "net.VSYS",
        pin2: sel.net.GND,
      }}
    />

    <led
      name="LED_POWER"
      color="red"
      footprint="0603"
      connections={{
        pin1: "net.VSYS",
        pin2: sel.net.GND,
      }}
    />
  </board>
)

export const getExampleCircuitJson = () => {
  const circuit = new RootCircuit()

  circuit.add(<ExampleCircuit />)

  return circuit.getCircuitJson()
}
