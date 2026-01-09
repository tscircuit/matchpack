import { test, expect } from "bun:test"
import { getExampleCircuitJson } from "../assets/ExampleCircuit01"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

test("getInputProblemFromCircuitJsonSchematic01", () => {
  const circuitJson = getExampleCircuitJson()

  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })
  expect(problem).toMatchInlineSnapshot(`
    {
      "chipGap": 0.2,
      "chipMap": {
        "C1": {
          "chipId": "C1",
          "pins": [
            "C1.1",
            "C1.2",
          ],
          "size": {
            "x": 0.53,
            "y": 1.1,
          },
        },
        "D1": {
          "chipId": "D1",
          "pins": [
            "D1.1",
            "D1.2",
          ],
          "size": {
            "x": 0.62,
            "y": 1.08,
          },
        },
        "I2C": {
          "chipId": "I2C",
          "pins": [
            "I2C.1",
            "I2C.2",
            "I2C.3",
          ],
          "size": {
            "x": 0.9,
            "y": 0.53,
          },
        },
        "INT_JP": {
          "chipId": "INT_JP",
          "pins": [
            "INT_JP.1",
            "INT_JP.2",
          ],
          "size": {
            "x": 0.3,
            "y": 0.9,
          },
        },
        "J1": {
          "chipId": "J1",
          "pins": [
            "J1.1",
            "J1.2",
            "J1.3",
            "J1.4",
          ],
          "size": {
            "x": 0.6,
            "y": 1,
          },
        },
        "J2": {
          "chipId": "J2",
          "pins": [
            "J2.1",
            "J2.2",
            "J2.3",
            "J2.4",
          ],
          "size": {
            "x": 0.6,
            "y": 1,
          },
        },
        "J3": {
          "chipId": "J3",
          "pins": [
            "J3.1",
            "J3.2",
            "J3.3",
            "J3.4",
            "J3.5",
            "J3.6",
          ],
          "size": {
            "x": 0.4,
            "y": 1.4,
          },
        },
        "LED": {
          "chipId": "LED",
          "pins": [
            "LED.1",
            "LED.2",
          ],
          "size": {
            "x": 0.3,
            "y": 0.9,
          },
        },
        "Q1": {
          "chipId": "Q1",
          "pins": [
            "Q1.1",
            "Q1.2",
            "Q1.3",
          ],
          "size": {
            "x": 0.89,
            "y": 1.16,
          },
        },
        "R2": {
          "chipId": "R2",
          "pins": [
            "R2.1",
            "R2.2",
          ],
          "size": {
            "x": 0.4094553499999995,
            "y": 1.1,
          },
        },
        "R3": {
          "chipId": "R3",
          "pins": [
            "R3.1",
            "R3.2",
          ],
          "size": {
            "x": 0.4094553499999995,
            "y": 1.1,
          },
        },
        "R4": {
          "chipId": "R4",
          "pins": [
            "R4.1",
            "R4.2",
          ],
          "size": {
            "x": 0.4094553499999995,
            "y": 1.1,
          },
        },
        "R5": {
          "chipId": "R5",
          "pins": [
            "R5.1",
            "R5.2",
          ],
          "size": {
            "x": 0.4094553499999995,
            "y": 1.1,
          },
        },
        "R7": {
          "chipId": "R7",
          "pins": [
            "R7.1",
            "R7.2",
          ],
          "size": {
            "x": 0.4094553499999995,
            "y": 1.1,
          },
        },
        "U1": {
          "chipId": "U1",
          "pins": [
            "U1.1",
            "U1.2",
            "U1.3",
            "U1.4",
            "U1.5",
            "U1.6",
          ],
          "size": {
            "x": 1.2000000000000002,
            "y": 0.8,
          },
        },
      },
      "chipPinMap": {
        "C1.1": {
          "offset": {
            "x": 0,
            "y": 0.55,
          },
          "pinId": "C1.1",
          "side": "y+",
        },
        "C1.2": {
          "offset": {
            "x": 0,
            "y": -0.55,
          },
          "pinId": "C1.2",
          "side": "y-",
        },
        "D1.1": {
          "offset": {
            "x": 0,
            "y": 0.54,
          },
          "pinId": "D1.1",
          "side": "y+",
        },
        "D1.2": {
          "offset": {
            "x": 0,
            "y": -0.5399999999999991,
          },
          "pinId": "D1.2",
          "side": "y-",
        },
        "I2C.1": {
          "offset": {
            "x": 0.4499999999999993,
            "y": -0.09999999999999995,
          },
          "pinId": "I2C.1",
          "side": "x+",
        },
        "I2C.2": {
          "offset": {
            "x": 0,
            "y": 0.25,
          },
          "pinId": "I2C.2",
          "side": "y+",
        },
        "I2C.3": {
          "offset": {
            "x": -0.4499999999999993,
            "y": -0.10000000000000006,
          },
          "pinId": "I2C.3",
          "side": "x-",
        },
        "INT_JP.1": {
          "offset": {
            "x": 0,
            "y": 0.4500000000000002,
          },
          "pinId": "INT_JP.1",
          "side": "y+",
        },
        "INT_JP.2": {
          "offset": {
            "x": 0,
            "y": -0.4499999999999993,
          },
          "pinId": "INT_JP.2",
          "side": "y-",
        },
        "J1.1": {
          "offset": {
            "x": 0.7000000000000002,
            "y": -0.2999999999999998,
          },
          "pinId": "J1.1",
          "side": "x+",
        },
        "J1.2": {
          "offset": {
            "x": 0.7000000000000002,
            "y": -0.09999999999999964,
          },
          "pinId": "J1.2",
          "side": "x+",
        },
        "J1.3": {
          "offset": {
            "x": 0.7000000000000002,
            "y": 0.09999999999999964,
          },
          "pinId": "J1.3",
          "side": "x+",
        },
        "J1.4": {
          "offset": {
            "x": 0.7000000000000002,
            "y": 0.2999999999999998,
          },
          "pinId": "J1.4",
          "side": "x+",
        },
        "J2.1": {
          "offset": {
            "x": 0.7000000000000002,
            "y": -0.2999999999999998,
          },
          "pinId": "J2.1",
          "side": "x+",
        },
        "J2.2": {
          "offset": {
            "x": 0.7000000000000002,
            "y": -0.09999999999999964,
          },
          "pinId": "J2.2",
          "side": "x+",
        },
        "J2.3": {
          "offset": {
            "x": 0.7000000000000002,
            "y": 0.09999999999999964,
          },
          "pinId": "J2.3",
          "side": "x+",
        },
        "J2.4": {
          "offset": {
            "x": 0.7000000000000002,
            "y": 0.2999999999999998,
          },
          "pinId": "J2.4",
          "side": "x+",
        },
        "J3.1": {
          "offset": {
            "x": 0.6000000000000001,
            "y": -0.5,
          },
          "pinId": "J3.1",
          "side": "x+",
        },
        "J3.2": {
          "offset": {
            "x": 0.6000000000000001,
            "y": -0.2999999999999998,
          },
          "pinId": "J3.2",
          "side": "x+",
        },
        "J3.3": {
          "offset": {
            "x": 0.6000000000000001,
            "y": -0.09999999999999964,
          },
          "pinId": "J3.3",
          "side": "x+",
        },
        "J3.4": {
          "offset": {
            "x": 0.6000000000000001,
            "y": 0.09999999999999964,
          },
          "pinId": "J3.4",
          "side": "x+",
        },
        "J3.5": {
          "offset": {
            "x": 0.6000000000000001,
            "y": 0.2999999999999998,
          },
          "pinId": "J3.5",
          "side": "x+",
        },
        "J3.6": {
          "offset": {
            "x": 0.6000000000000001,
            "y": 0.5,
          },
          "pinId": "J3.6",
          "side": "x+",
        },
        "LED.1": {
          "offset": {
            "x": 0,
            "y": 0.4499999999999993,
          },
          "pinId": "LED.1",
          "side": "y+",
        },
        "LED.2": {
          "offset": {
            "x": 0,
            "y": -0.45000000000000107,
          },
          "pinId": "LED.2",
          "side": "y-",
        },
        "Q1.1": {
          "offset": {
            "x": 0.30000000000000004,
            "y": 0.55,
          },
          "pinId": "Q1.1",
          "side": "y+",
        },
        "Q1.2": {
          "offset": {
            "x": 0.31000000000000005,
            "y": -0.55,
          },
          "pinId": "Q1.2",
          "side": "y-",
        },
        "Q1.3": {
          "offset": {
            "x": -0.41999999999999993,
            "y": -0.1,
          },
          "pinId": "Q1.3",
          "side": "x-",
        },
        "R2.1": {
          "offset": {
            "x": 0,
            "y": -0.55,
          },
          "pinId": "R2.1",
          "side": "y-",
        },
        "R2.2": {
          "offset": {
            "x": 0,
            "y": 0.5499999999999999,
          },
          "pinId": "R2.2",
          "side": "y+",
        },
        "R3.1": {
          "offset": {
            "x": 0,
            "y": -0.5499999999999998,
          },
          "pinId": "R3.1",
          "side": "y-",
        },
        "R3.2": {
          "offset": {
            "x": 0,
            "y": 0.5499999999999998,
          },
          "pinId": "R3.2",
          "side": "y+",
        },
        "R4.1": {
          "offset": {
            "x": 0,
            "y": -0.5500000000000007,
          },
          "pinId": "R4.1",
          "side": "y-",
        },
        "R4.2": {
          "offset": {
            "x": 0,
            "y": 0.5499999999999989,
          },
          "pinId": "R4.2",
          "side": "y+",
        },
        "R5.1": {
          "offset": {
            "x": 0,
            "y": -0.55,
          },
          "pinId": "R5.1",
          "side": "y-",
        },
        "R5.2": {
          "offset": {
            "x": 0,
            "y": 0.5499999999999999,
          },
          "pinId": "R5.2",
          "side": "y+",
        },
        "R7.1": {
          "offset": {
            "x": 0,
            "y": -0.55,
          },
          "pinId": "R7.1",
          "side": "y-",
        },
        "R7.2": {
          "offset": {
            "x": 0,
            "y": 0.5499999999999999,
          },
          "pinId": "R7.2",
          "side": "y+",
        },
        "U1.1": {
          "offset": {
            "x": 1,
            "y": 0.2,
          },
          "pinId": "U1.1",
          "side": "x+",
        },
        "U1.2": {
          "offset": {
            "x": -1,
            "y": -0.2,
          },
          "pinId": "U1.2",
          "side": "x-",
        },
        "U1.3": {
          "offset": {
            "x": -1,
            "y": 0,
          },
          "pinId": "U1.3",
          "side": "x-",
        },
        "U1.4": {
          "offset": {
            "x": -1,
            "y": 0.2,
          },
          "pinId": "U1.4",
          "side": "x-",
        },
        "U1.5": {
          "offset": {
            "x": 1,
            "y": -0.2,
          },
          "pinId": "U1.5",
          "side": "x+",
        },
        "U1.6": {
          "offset": {
            "x": 1,
            "y": 0,
          },
          "pinId": "U1.6",
          "side": "x+",
        },
      },
      "netConnMap": {
        "C1.1-V3_3_SW": true,
        "C1.2-GND": true,
        "I2C.2-V3_3_SW": true,
        "INT_JP.1-V3_3_SW": true,
        "J1.1-GND": true,
        "J1.2-V3_3": true,
        "J1.3-SDA": true,
        "J1.4-SCL": true,
        "J2.1-GND": true,
        "J2.2-V3_3": true,
        "J2.3-SDA": true,
        "J2.4-SCL": true,
        "J3.1-GND": true,
        "J3.2-V3_3": true,
        "J3.3-SDA": true,
        "J3.4-SCL": true,
        "J3.5-DISABLE": true,
        "J3.6-N_INT": true,
        "LED.2-GND": true,
        "Q1.1-V3_3": true,
        "Q1.2-V3_3_SW": true,
        "Q1.3-DISABLE": true,
        "R2.1-SDA": true,
        "R3.2-V3_3_SW": true,
        "R4.1-INT": true,
        "R4.1-N_INT": true,
        "R5.1-SCL": true,
        "R7.1-GND": true,
        "U1.1-SCL": true,
        "U1.2-GND": true,
        "U1.3-GND": true,
        "U1.4-V3_3_SW": true,
        "U1.5-N_INT": true,
        "U1.6-SDA": true,
      },
      "netMap": {
        "DISABLE": {
          "netId": "DISABLE",
        },
        "GND": {
          "netId": "GND",
        },
        "INT": {
          "netId": "INT",
        },
        "N_INT": {
          "netId": "N_INT",
        },
        "SCL": {
          "netId": "SCL",
        },
        "SDA": {
          "netId": "SDA",
        },
        "V3_3": {
          "netId": "V3_3",
        },
        "V3_3_SW": {
          "netId": "V3_3_SW",
        },
      },
      "partitionGap": 2,
      "pinStrongConnMap": {
        "D1.1-R3.1": true,
        "D1.2-LED.1": true,
        "I2C.1-R5.2": true,
        "I2C.3-R2.2": true,
        "INT_JP.2-R4.2": true,
        "LED.1-D1.2": true,
        "Q1.3-R7.2": true,
        "R2.2-I2C.3": true,
        "R3.1-D1.1": true,
        "R4.2-INT_JP.2": true,
        "R5.2-I2C.1": true,
        "R7.2-Q1.3": true,
      },
    }
  `)
})
