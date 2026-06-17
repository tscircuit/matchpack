import type { ChipProps, SubcircuitProps } from "@tscircuit/props"
import { RootCircuit } from "tscircuit"

const pinLabels = {
  pin1: ["SDA"],
  pin2: ["SCL"],
  pin3: ["VSS"],
  pin4: ["NC3"],
  pin5: ["VDD"],
  pin6: ["BAT"],
  pin7: ["SRN"],
  pin8: ["SRP"],
  pin9: ["NC2"],
  pin10: ["BIN"],
  pin11: ["NC1"],
  pin12: ["GPOUT"],
  pin13: ["EP"],
} as const

export const BQ27441DRZR_G1B = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      supplierPartNumbers={{
        jlcpcb: ["C473374"],
      }}
      manufacturerPartNumber="BQ27441DRZR_G1B"
      footprint={
        <footprint>
          <smtpad
            portHints={["pin12"]}
            pcbX="-1.0001504mm"
            pcbY="1.974977mm"
            width="0.1999996mm"
            height="0.850011mm"
            shape="rect"
          />
          <smtpad
            portHints={["pin11"]}
            pcbX="-0.6001004mm"
            pcbY="1.974977mm"
            width="0.1999996mm"
            height="0.850011mm"
            shape="rect"
          />
          <smtpad
            portHints={["pin10"]}
            pcbX="-0.2000504mm"
            pcbY="1.974977mm"
            width="0.1999996mm"
            height="0.850011mm"
            shape="rect"
          />
          <smtpad
            portHints={["pin9"]}
            pcbX="0.1999996mm"
            pcbY="1.974977mm"
            width="0.1999996mm"
            height="0.850011mm"
            shape="rect"
          />
          <smtpad
            portHints={["pin8"]}
            pcbX="0.5997956mm"
            pcbY="1.974977mm"
            width="0.1999996mm"
            height="0.850011mm"
            shape="rect"
          />
          <smtpad
            portHints={["pin7"]}
            pcbX="0.9998456mm"
            pcbY="1.974977mm"
            width="0.1999996mm"
            height="0.850011mm"
            shape="rect"
          />
          <smtpad
            portHints={["pin6"]}
            pcbX="0.9998456mm"
            pcbY="-1.974977mm"
            width="0.1999996mm"
            height="0.850011mm"
            shape="rect"
          />
          <smtpad
            portHints={["pin5"]}
            pcbX="0.5997956mm"
            pcbY="-1.974977mm"
            width="0.1999996mm"
            height="0.850011mm"
            shape="rect"
          />
          <smtpad
            portHints={["pin4"]}
            pcbX="0.1997456mm"
            pcbY="-1.974977mm"
            width="0.1999996mm"
            height="0.850011mm"
            shape="rect"
          />
          <smtpad
            portHints={["pin3"]}
            pcbX="-0.2000504mm"
            pcbY="-1.974977mm"
            width="0.1999996mm"
            height="0.850011mm"
            shape="rect"
          />
          <smtpad
            portHints={["pin2"]}
            pcbX="-0.6001004mm"
            pcbY="-1.974977mm"
            width="0.1999996mm"
            height="0.850011mm"
            shape="rect"
          />
          <smtpad
            portHints={["pin1"]}
            pcbX="-1.0001504mm"
            pcbY="-1.974977mm"
            width="0.1999996mm"
            height="0.850011mm"
            shape="rect"
          />
          <smtpad
            portHints={["pin13"]}
            points={[
              { x: "-1.651mm", y: "1.2699492mm" },
              { x: "1.651mm", y: "1.2699492mm" },
              { x: "1.651mm", y: "1.0159492mm" },
              { x: "1.016mm", y: "1.0159492mm" },
              { x: "1.016mm", y: "-1.0160508mm" },
              { x: "1.651mm", y: "-1.0160508mm" },
              { x: "1.651mm", y: "-1.2700508mm" },
              { x: "-1.651mm", y: "-1.2700508mm" },
              { x: "-1.651mm", y: "-1.0160508mm" },
              { x: "-1.016mm", y: "-1.0160508mm" },
              { x: "-1.016mm", y: "1.0159492mm" },
              { x: "-1.651mm", y: "1.0159492mm" },
            ]}
            shape="polygon"
          />
          <silkscreenpath
            route={[
              { x: -1.279296400000021, y: 2.2855681999999433 },
              { x: -1.3974318000000494, y: 2.2855681999999433 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: 1.6510000000000673, y: 1.4041120000000546 },
              { x: 1.6505935999998655, y: 2.2855681999999433 },
              { x: 1.2790170000000671, y: 2.2855681999999433 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: 1.6505681999999524, y: -0.8208264000001009 },
              { x: 1.6505681999999524, y: 0.8208518000001277 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: 1.2790423999999803, y: -2.2864318000000594 },
              { x: 1.5235681999999997, y: -2.2864318000000594 },
              { x: 1.6505681999999524, y: -2.2864318000000594 },
              { x: 1.6505681999999524, y: -1.404111999999941 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: -1.6514318000000685, y: -1.404111999999941 },
              { x: -1.6514318000000685, y: -1.7784317999999075 },
              { x: -1.6514318000000685, y: -2.0324318000000403 },
              { x: -1.3974318000000494, y: -2.2864318000000594 },
              { x: -1.279296400000021, y: -2.2864318000000594 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: -1.6514318000000685, y: 0.8208518000001277 },
              { x: -1.6514318000000685, y: -0.8208264000001009 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: -1.279296400000021, y: 2.2855681999999433 },
              { x: -1.6514318000000685, y: 2.2855681999999433 },
              { x: -1.6514318000000685, y: 1.4041374000000815 },
            ]}
          />
          <silkscreenpath
            route={[
              { x: -0.9109964000000446, y: -2.6899869999999737 },
              { x: -0.9136880552781577, y: -2.7104321516487744 },
              { x: -0.921579589253497, y: -2.729483999999843 },
              { x: -0.9341332069269583, y: -2.745844193073026 },
              { x: -0.9504934000001413, y: -2.7583978107464873 },
              { x: -0.9695452483512099, y: -2.7662893447218266 },
              { x: -0.9899904000000106, y: -2.7689809999999397 },
              { x: -1.010435551648925, y: -2.7662893447218266 },
              { x: -1.0294873999999936, y: -2.7583978107464873 },
              { x: -1.0458475930730629, y: -2.745844193073026 },
              { x: -1.0584012107465242, y: -2.729483999999843 },
              { x: -1.0662927447219772, y: -2.7104321516487744 },
              { x: -1.0689844000000903, y: -2.6899869999999737 },
              { x: -1.0662927447219772, y: -2.669541848351173 },
              { x: -1.0584012107465242, y: -2.6504899999999907 },
              { x: -1.0458475930730629, y: -2.6341298069269214 },
              { x: -1.0294873999999936, y: -2.6215761892533465 },
              { x: -1.010435551648925, y: -2.6136846552781208 },
              { x: -0.9899904000000106, y: -2.6109930000000077 },
              { x: -0.9695452483512099, y: -2.6136846552781208 },
              { x: -0.9504934000001413, y: -2.6215761892533465 },
              { x: -0.9341332069269583, y: -2.6341298069269214 },
              { x: -0.921579589253497, y: -2.6504899999999907 },
              { x: -0.9136880552781577, y: -2.669541848351173 },
              { x: -0.9109964000000446, y: -2.6899869999999737 },
            ]}
          />
          <silkscreentext
            text="{NAME}"
            pcbX="-0.0004064mm"
            pcbY="3.412619mm"
            anchorAlignment="center"
            fontSize="1mm"
          />
          <courtyardoutline
            outline={[
              { x: -1.9014064000000417, y: 2.6626189999999497 },
              { x: 1.9005935999998655, y: 2.6626189999999497 },
              { x: 1.9005935999998655, y: -3.0189809999999397 },
              { x: -1.9014064000000417, y: -3.0189809999999397 },
              { x: -1.9014064000000417, y: 2.6626189999999497 },
            ]}
          />
        </footprint>
      }
      cadModel={{
        objUrl:
          "https://modelcdn.tscircuit.com/easyeda_models/assets/C473374.obj?uuid=00d7095106f5425cb6f89a9dc86f2a31",
        stepUrl:
          "https://modelcdn.tscircuit.com/easyeda_models/assets/C473374.step?uuid=00d7095106f5425cb6f89a9dc86f2a31",
        pcbRotationOffset: 0,
        modelOriginPosition: {
          x: -0.000012700000070253736,
          y: 0.00006349999989652133,
          z: 0,
        },
      }}
      {...props}
    />
  )
}

export const BQ27441BatteryGaugeSubcircuit = (props: SubcircuitProps) => (
  <subcircuit
    schMaxTraceDistance={20}
    width={100}
    height={100}
    {...props}
    schAutoLayoutEnabled
  >
    <BQ27441DRZR_G1B
      name="U1"
      schX={0}
      schY={0}
      schWidth={3}
      schHeight={3}
      showPinAliases={false}
      noConnect={["NC1", "NC2", "NC3"]}
      schPinArrangement={{
        leftSide: {
          direction: "top-to-bottom",
          pins: ["SDA", "SCL", "VSS", "NC3", "VDD", "BAT"],
        },
        rightSide: {
          direction: "top-to-bottom",
          pins: ["GPOUT", "NC1", "BIN", "NC2", "SRP", "SRN"],
        },
        bottomSide: {
          direction: "left-to-right",
          pins: ["EP"],
        },
      }}
      schPinStyle={{
        VSS: { marginBottom: 0.35 },
        NC3: { marginBottom: 0.25 },
        VDD: { marginBottom: 0.3 },
        NC1: { marginBottom: 0.35 },
        BIN: { marginBottom: 0.25 },
        NC2: { marginBottom: 0.3 },
        SRP: { marginBottom: 0.05 },
      }}
      connections={{
        VSS: "net.PGND",
        EP: "net.PGND",
        SDA: "net.SDA",
        SCL: "net.SCL",
        GPOUT: "net.GPOUT",
        BIN: "net.BIN",
      }}
    />

    <chip
      name="J5"
      manufacturerPartNumber="Battery Pack"
      footprint="pinrow3"
      pinLabels={{
        pin1: "PACKN",
        pin2: "BIN",
        pin3: "PACKP",
      }}
      schPinArrangement={{
        rightSide: {
          direction: "bottom-to-top",
          pins: ["pin1", "pin2", "pin3"],
        },
      }}
      connections={{
        pin1: "net.PGND",
        pin2: "net.BIN",
        pin3: "net.PACKP",
      }}
    />

    <resistor
      name="R1"
      resistance="0.010"
      tolerance="1%"
      footprint="1206"
      connections={{
        pin1: "net.PACKP",
        pin2: "net.VSYS",
      }}
    />

    <resistor name="R2" resistance="5.1k" footprint="0603" />
    <resistor name="R3" resistance="5.1k" footprint="0603" />
    <resistor name="R4" resistance="5.1k" footprint="0603" />
    <resistor name="R5" resistance="1.8M" footprint="0603" />

    <capacitor
      name="C1"
      capacitance="0.47uF"
      footprint="0603"
      connections={{
        pin2: "net.PGND",
      }}
    />

    <capacitor
      name="C2"
      capacitance="1.0uF"
      footprint="0603"
      connections={{
        pin1: "net.PACKP",
        pin2: "net.PGND",
      }}
    />

    <trace from="R2.pin1" to="R3.pin1" />
    <trace from="R4.pin1" to="R5.pin1" />

    <trace from="R2.pin2" to="U1.SDA" />
    <trace from="R3.pin2" to="U1.SCL" />

    <trace from="R4.pin2" to="U1.GPOUT" />
    <trace from="R5.pin2" to="U1.BIN" />

    <trace from="C1.pin1" to="U1.VDD" />

    <trace from="J5.pin3" to="C2.pin1" />
    <trace from="C2.pin1" to="U1.BAT" />
    <trace from="C2.pin1" to="R1.pin1" />
    <trace from="R1.pin1" to="U1.SRP" />
    <trace from="R1.pin2" to="U1.SRN" />

    <trace from="J5.pin1" to="net.PGND" />
    <trace from="C1.pin2" to="net.PGND" />
    <trace from="C2.pin2" to="net.PGND" />
    <trace from="U1.VSS" to="net.PGND" />
    <trace from="U1.EP" to="net.PGND" />
  </subcircuit>
)

export const ExampleCircuit = () => (
  <board width="100mm" height="100mm" routingDisabled>
    <BQ27441BatteryGaugeSubcircuit name="BQ27441" />
  </board>
)

export const getExampleCircuitJson = () => {
  const circuit = new RootCircuit()

  circuit.add(<ExampleCircuit />)

  return circuit.getCircuitJson()
}
