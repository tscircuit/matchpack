import { expect, test } from "bun:test"
import { RootCircuit } from "tscircuit"

const DualRailConnectedLoads = () => (
  <board width="10mm" height="10mm">
    <resistor resistance="1k" footprint="0402" name="R1" />
    <diode footprint="0402" name="D1" />
    <resistor resistance="1k" footprint="0402" name="R2" />
    <capacitor capacitance="100" footprint="0402" name="C1" />
    <chip
      name="U1"
      footprint="soic8"
      pinLabels={{
        pin1: "VCC",
        pin2: "DISCH",
        pin3: "THRES",
        pin4: "CTRL",
        pin5: "GND",
        pin6: "TRIG",
        pin7: "OUT",
        pin8: "RESET",
      }}
    />
    <trace from=".U1 > .pin1" to=".R1 >  .pin1" />
    <trace from=".R1 > .pin2" to=".D1 >  .pin1" />
    <trace from=".D1 > .pin2" to="net.GND" />

    <trace from=".U1 > .pin8" to=".C1 >  .pin1" />
    <trace from=".C1 > .pin2" to=".R2 >  .pin1" />
    <trace from=".R2 > .pin2" to="net.GND" />
  </board>
)

test("Core schematic for dual grounded load chains", async () => {
  const circuit = new RootCircuit()
  circuit.add(<DualRailConnectedLoads />)
  await circuit.renderUntilSettled()

  const schematicSvg = await circuit.getSvg({ view: "schematic" })
  await expect(schematicSvg).toMatchSvgSnapshot(import.meta.path)
})
