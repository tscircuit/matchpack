import type { ChipProps } from "@tscircuit/props"
import { Circuit } from "tscircuit"

const pinLabels = {
  pin1: ["IOVDD1"],
  pin2: ["GPIO0"],
  pin3: ["GPIO1"],
  pin4: ["GPIO2"],
  pin5: ["GPIO3"],
  pin6: ["GPIO4"],
  pin7: ["GPIO5"],
  pin8: ["GPIO6"],
  pin9: ["GPIO7"],
  pin10: ["IOVDD2"],
  pin11: ["GPIO8"],
  pin12: ["GPIO9"],
  pin13: ["GPIO10"],
  pin14: ["GPIO11"],
  pin15: ["GPIO12"],
  pin16: ["GPIO13"],
  pin17: ["GPIO14"],
  pin18: ["GPIO15"],
  pin19: ["TESTEN"],
  pin20: ["XIN"],
  pin21: ["XOUT"],
  pin22: ["IOVDD3"],
  pin23: ["DVDD1"],
  pin24: ["SWCLK"],
  pin25: ["SWD"],
  pin26: ["RUN"],
  pin27: ["GPIO16"],
  pin28: ["GPIO17"],
  pin29: ["GPIO18"],
  pin30: ["GPIO19"],
  pin31: ["GPIO20"],
  pin32: ["GPIO21"],
  pin33: ["IOVDD4"],
  pin34: ["GPIO22"],
  pin35: ["GPIO23"],
  pin36: ["GPIO24"],
  pin37: ["GPIO25"],
  pin38: ["GPIO26_ADC0"],
  pin39: ["GPIO27_ADC1"],
  pin40: ["GPIO28_ADC2"],
  pin41: ["GPIO29_ADC3"],
  pin42: ["IOVDD5"],
  pin43: ["ADC_AVDD"],
  pin44: ["VREG_VIN"],
  pin45: ["VREG_VOUT"],
  pin46: ["USB_DM"],
  pin47: ["USB_DP"],
  pin48: ["USB_VDD"],
  pin49: ["IOVDD6"],
  pin50: ["DVDD2"],
  pin51: ["QSPI_SD3"],
  pin52: ["QSPI_SCLK"],
  pin53: ["QSPI_SD0"],
  pin54: ["QSPI_SD2"],
  pin55: ["QSPI_SD1"],
  pin56: ["QSPI_SS_N"],
  pin57: ["GND"],
} as const

const RP2040 = (props: ChipProps<typeof pinLabels>) => {
  return (
    <chip
      pinLabels={pinLabels}
      supplierPartNumbers={{
        jlcpcb: ["C2040"],
      }}
      schPinArrangement={{
        leftSide: {
          direction: "top-to-bottom",
          pins: [
            // Top on ref
            "QSPI_SS_N",
            "QSPI_SD1",
            "QSPI_SD2",
            "QSPI_SD0",
            "QSPI_SCLK",
            "QSPI_SD3",
            "DVDD1",
            "DVDD2",
            "VREG_VIN",
            "VREG_VOUT",
            "IOVDD1",
            "IOVDD2",
            "IOVDD3",
            "IOVDD4",
            "IOVDD5",
            "IOVDD6",
            "GND",
            "USB_VDD",
            "USB_DP",
            "USB_DM",
            "ADC_AVDD",

            "GPIO0",
            "GPIO1",
            "GPIO2",
            "GPIO3",
            "GPIO4",
            "GPIO5",
            "GPIO6",
            "GPIO7",
            "GPIO8",
            "GPIO9",
            "GPIO10",
            "GPIO11",
          ],
        },
        rightSide: {
          direction: "top-to-bottom",
          pins: [
            "GPIO29_ADC3",
            "GPIO28_ADC2",
            "GPIO27_ADC1",
            "GPIO26_ADC0",
            "GPIO25",
            "GPIO24",
            "GPIO23",
            "GPIO22",
            "GPIO21",
            "GPIO20",
            "GPIO19",
            "GPIO18",
            "GPIO17",
            "GPIO16",

            "GPIO12",
            "GPIO13",
            "GPIO14",
            "GPIO15",
            "TESTEN",
            "XIN",
            "XOUT",
            "SWCLK",
            "SWD",
            "RUN",
          ],
        },
      }}
      schWidth={3}
      schPinStyle={{
        IOVDD1: {
          marginTop: 0.4,
        },
        GND: {
          marginTop: 0.4,
          marginBottom: 0.4,
        },
        GPIO25: {
          marginTop: 0.4,
        },
        GPIO12: {
          marginTop: 0.4,
        },
        XIN: {
          marginTop: 0.4,
        },
        XOUT: {
          marginBottom: 0.4,
        },
        VREG_VIN: {
          marginTop: 0.4,
        },
      }}
      manufacturerPartNumber="RP2040"
      {...props}
    />
  )
}

export const RP2040Circuit = () => (
  <board routingDisabled>
    <RP2040
      name="U3"
      connections={{
        IOVDD1: ["C12.pin1", "net.V3_3"],
        IOVDD2: ["C14.pin1", "net.V3_3"],
        IOVDD3: ["C8.pin1", "net.V3_3"],
        IOVDD4: ["C13.pin1", "net.V3_3"],
        IOVDD5: ["C15.pin1", "net.V3_3"],
        IOVDD6: ["C19.pin1", "net.V3_3"],

        DVDD1: ["C18.1", "net.V1_1"],
        DVDD2: ["C7.1", "net.V1_1"],

        USB_VDD: "net.USB_VDD",
        USB_DM: "net.USB_N",
        USB_DP: "net.USB_P",
      }}
    />
    {/* Decoupling Capacitors for IOVDD */}
    {["C12", "C14", "C8", "C13", "C15", "C19"].map((cName) => (
      <capacitor
        name={cName}
        capacitance="100nF"
        schOrientation="vertical"
        connections={{
          pin2: "net.GND",
        }}
      />
    ))}
    <capacitor
      name="C18"
      capacitance="100nF"
      schOrientation="vertical"
      connections={{
        pin2: "net.GND",
      }}
    />
    <capacitor
      name="C7"
      capacitance="22nF"
      schOrientation="vertical"
      connections={{
        pin2: "net.GND",
      }}
    />
    <capacitor
      name="C9"
      capacitance="2.2uF"
      schOrientation="vertical"
      connections={{ pin1: "net.V1_1", pin2: "net.GND" }}
    />
    <capacitor
      name="C10"
      capacitance="2.2uF"
      schOrientation="vertical"
      connections={{ pin1: "U3.VREG_VIN", pin2: "net.GND" }}
    />
    <capacitor
      name="C11"
      capacitance="2.2uF"
      schOrientation="vertical"
      connections={{ pin1: "U3.ADC_AVDD", pin2: "net.GND" }}
    />
  </board>
)

export const getExampleCircuitJson = () => {
  const circuit = new Circuit()
  circuit.add(<RP2040Circuit />)
  return circuit.getCircuitJson()
}
