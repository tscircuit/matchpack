import { sel, RootCircuit } from "tscircuit"
import type { ChipProps } from "@tscircuit/props"

/**
 * Symmetric Switch Matrix Circuit - Repro47
 * This circuit demonstrates a switch matrix with repeated symmetric patterns
 * that should be laid out in an organized grid but currently aren't optimized
 */

export const SymmetricSwitchMatrix = () => (
  <board width="50mm" height="50mm" routingDisabled>
    <group name="SwitchMatrix">
      {/* Row 1 - First set of symmetric switches */}
      <group name="Row1" schX={-15} schY={10}>
        <capacitor
          name="C1_1"
          footprint="0402"
          capacitance="100nF"
          schX={-6}
          schY={0}
        />
        <resistor
          name="R1_1"
          footprint="0402"
          resistance="10k"
          schX={-3}
          schY={0}
        />
        <chip
          name="SW1_1"
          footprint="sot-23"
          pinLabels={{ pin1: ["IN"], pin2: ["OUT"], pin3: ["GND"] }}
          manufacturerPartNumber="BSS138"
          schX={0}
          schY={0}
        />
        <capacitor
          name="C1_2"
          footprint="0402"
          capacitance="100nF"
          schX={3}
          schY={0}
        />
        <resistor
          name="R1_2"
          footprint="0402"
          resistance="10k"
          schX={6}
          schY={0}
        />
      </group>

      {/* Row 2 - Identical pattern to Row1 */}
      <group name="Row2" schX={-15} schY={5}>
        <capacitor
          name="C2_1"
          footprint="0402"
          capacitance="100nF"
          schX={-6}
          schY={0}
        />
        <resistor
          name="R2_1"
          footprint="0402"
          resistance="10k"
          schX={-3}
          schY={0}
        />
        <chip
          name="SW2_1"
          footprint="sot-23"
          pinLabels={{ pin1: ["IN"], pin2: ["OUT"], pin3: ["GND"] }}
          manufacturerPartNumber="BSS138"
          schX={0}
          schY={0}
        />
        <capacitor
          name="C2_2"
          footprint="0402"
          capacitance="100nF"
          schX={3}
          schY={0}
        />
        <resistor
          name="R2_2"
          footprint="0402"
          resistance="10k"
          schX={6}
          schY={0}
        />
      </group>

      {/* Row 3 - Identical pattern to Row1 and Row2 */}
      <group schX={-15} schY={0}>
        <capacitor
          name="C3_1"
          footprint="0402"
          capacitance="100nF"
          schX={-6}
          schY={0}
        />
        <resistor
          name="R3_1"
          footprint="0402"
          resistance="10k"
          schX={-3}
          schY={0}
        />
        <chip
          name="SW3_1"
          footprint="sot-23"
          pinLabels={{ pin1: ["IN"], pin2: ["OUT"], pin3: ["GND"] }}
          manufacturerPartNumber="BSS138"
          schX={0}
          schY={0}
        />
        <capacitor
          name="C3_2"
          footprint="0402"
          capacitance="100nF"
          schX={3}
          schY={0}
        />
        <resistor
          name="R3_2"
          footprint="0402"
          resistance="10k"
          schX={6}
          schY={0}
        />
      </group>

      {/* Row 4 - Identical pattern to previous rows */}
      <group name="Row4" schX={-15} schY={-5}>
        <capacitor
          name="C4_1"
          footprint="0402"
          capacitance="100nF"
          schX={-6}
          schY={0}
        />
        <resistor
          name="R4_1"
          footprint="0402"
          resistance="10k"
          schX={-3}
          schY={0}
        />
        <chip
          name="SW4_1"
          footprint="sot-23"
          pinLabels={{ pin1: ["IN"], pin2: ["OUT"], pin3: ["GND"] }}
          manufacturerPartNumber="BSS138"
          schX={0}
          schY={0}
        />
        <capacitor
          name="C4_2"
          footprint="0402"
          capacitance="100nF"
          schX={3}
          schY={0}
        />
        <resistor
          name="R4_2"
          footprint="0402"
          resistance="10k"
          schX={6}
          schY={0}
        />
      </group>

      {/* Control logic - asymmetric section */}
      <group name="ControlLogic" schX={15} schY={0}>
        <chip
          name="CTRL1"
          footprint="tssop-32"
          pinLabels={{
            pin1: ["VCC"],
            pin2: ["GND"],
            pin3: ["OUT1"],
            pin4: ["OUT2"],
            pin5: ["OUT3"],
            pin6: ["OUT4"],
          }}
          manufacturerPartNumber="STM32F103"
          schX={0}
          schY={0}
        />
        <capacitor
          name="C_CTRL"
          footprint="0603"
          capacitance="10uF"
          schX={0}
          schY={-3}
        />
      </group>

      {/* Power distribution - should be optimized separately */}
      <group name="PowerDist" schX={0} schY={-15}>
        <capacitor
          name="C_PWR1"
          footprint="1206"
          capacitance="47uF"
          schX={-6}
        />
        <capacitor
          name="C_PWR2"
          footprint="1206"
          capacitance="47uF"
          schX={-2}
        />
        <capacitor name="C_PWR3" footprint="1206" capacitance="47uF" schX={2} />
        <capacitor name="C_PWR4" footprint="1206" capacitance="47uF" schX={6} />
      </group>

      {/* Connections showing the symmetric pattern relationships */}
      <trace from="SW1_1.pin1" to="CTRL1.pin3" />
      <trace from="SW2_1.pin1" to="CTRL1.pin4" />
      <trace from="SW3_1.pin1" to="CTRL1.pin5" />
      <trace from="SW4_1.pin1" to="CTRL1.pin6" />

      {/* Power connections */}
      <trace from="C_PWR1.1" to="net.VCC" />
      <trace from="C_PWR2.1" to="net.VCC" />
      <trace from="C_PWR3.1" to="net.VCC" />
      <trace from="C_PWR4.1" to="net.VCC" />

      <trace from="C_PWR1.2" to="net.GND" />
      <trace from="C_PWR2.2" to="net.GND" />
      <trace from="C_PWR3.2" to="net.GND" />
      <trace from="C_PWR4.2" to="net.GND" />

      {/* Ground connections for all switches */}
      <trace from="SW1_1.pin3" to="net.GND" />
      <trace from="SW2_1.pin3" to="net.GND" />
      <trace from="SW3_1.pin3" to="net.GND" />
      <trace from="SW4_1.pin3" to="net.GND" />

      <trace from="CTRL1.pin2" to="net.GND" />
      <trace from="C_CTRL.2" to="net.GND" />
    </group>
  </board>
)

export const getSymmetricSwitchMatrixJson = () => {
  const circuit = new RootCircuit()
  circuit.add(<SymmetricSwitchMatrix />)
  return circuit.getCircuitJson()
}
