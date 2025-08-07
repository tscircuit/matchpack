import { test, expect } from "bun:test"
import { getExampleCircuitJson } from "../assets/ExampleCircuit01"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

test("getInputProblemFromCircuitJsonSchematic01", () => {
  const circuitJson = getExampleCircuitJson()

  console.log(circuitJson)

  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })
  expect(problem).toMatchInlineSnapshot(`
    {
      "chipMap": {
        "C1": {
          "chipId": "C1",
          "pins": [
            "C1.1",
            "C1.2",
          ],
          "size": {
            "x": 0.5291665999999999,
            "y": 1.0583333000000001,
          },
        },
        "D1": {
          "chipId": "D1",
          "pins": [
            "D1.1",
            "D1.2",
          ],
          "size": {
            "x": 0.6221256000000088,
            "y": 1.0521572000000003,
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
            "x": 0.8843008999999997,
            "y": 0.5299361999999987,
          },
        },
        "INT_JP": {
          "chipId": "INT_JP",
          "pins": [
            "INT_JP.1",
            "INT_JP.2",
          ],
          "size": {
            "x": 0.30829299999999904,
            "y": 0.8811970999999998,
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
            "x": 0.30829299999999904,
            "y": 0.8811970999999998,
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
            "x": 0.8935117710000002,
            "y": 1.1601665819999987,
          },
        },
        "R2": {
          "chipId": "R2",
          "pins": [
            "R2.1",
            "R2.2",
          ],
          "size": {
            "x": 0.40790845000000175,
            "y": 1.0583332999999997,
          },
        },
        "R3": {
          "chipId": "R3",
          "pins": [
            "R3.1",
            "R3.2",
          ],
          "size": {
            "x": 0.40790845000000175,
            "y": 1.0583332999999997,
          },
        },
        "R4": {
          "chipId": "R4",
          "pins": [
            "R4.1",
            "R4.2",
          ],
          "size": {
            "x": 0.40790845000000175,
            "y": 1.0583332999999997,
          },
        },
        "R5": {
          "chipId": "R5",
          "pins": [
            "R5.1",
            "R5.2",
          ],
          "size": {
            "x": 0.40790845000000175,
            "y": 1.0583332999999997,
          },
        },
        "R7": {
          "chipId": "R7",
          "pins": [
            "R7.1",
            "R7.2",
          ],
          "size": {
            "x": 0.40790845000000175,
            "y": 1.0583332999999997,
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
            "x": -0.00027334999999961695,
            "y": 0.5512093000000002,
          },
          "pinId": "C1.1",
          "side": "y+",
        },
        "C1.2": {
          "offset": {
            "x": 0.00027334999999961695,
            "y": -0.5512093000000002,
          },
          "pinId": "C1.2",
          "side": "y-",
        },
        "D1.1": {
          "offset": {
            "x": 0.004432900000001183,
            "y": 0.5362093000000003,
          },
          "pinId": "D1.1",
          "side": "y+",
        },
        "D1.2": {
          "offset": {
            "x": 0.004886400000003732,
            "y": -0.5362092999999994,
          },
          "pinId": "D1.2",
          "side": "y-",
        },
        "I2C.1": {
          "offset": {
            "x": 0.44580080000000066,
            "y": -0.10158727049999955,
          },
          "pinId": "I2C.1",
          "side": "x+",
        },
        "I2C.2": {
          "offset": {
            "x": 0.0034928000000000736,
            "y": 0.25259902949999957,
          },
          "pinId": "I2C.2",
          "side": "y+",
        },
        "I2C.3": {
          "offset": {
            "x": -0.44580080000000066,
            "y": -0.10146287049999964,
          },
          "pinId": "I2C.3",
          "side": "x-",
        },
        "INT_JP.1": {
          "offset": {
            "x": 0.00006220000000034531,
            "y": 0.4458007999999998,
          },
          "pinId": "INT_JP.1",
          "side": "y+",
        },
        "INT_JP.2": {
          "offset": {
            "x": -0.00006220000000034531,
            "y": -0.4458007999999998,
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
            "x": 0.00006220000000034531,
            "y": 0.44580080000000066,
          },
          "pinId": "LED.1",
          "side": "y+",
        },
        "LED.2": {
          "offset": {
            "x": -0.00006220000000034531,
            "y": -0.44580080000000066,
          },
          "pinId": "LED.2",
          "side": "y-",
        },
        "Q1.1": {
          "offset": {
            "x": 0.30397715550000004,
            "y": 0.5519248499999994,
          },
          "pinId": "Q1.1",
          "side": "y+",
        },
        "Q1.2": {
          "offset": {
            "x": 0.31067575550000137,
            "y": -0.5519248499999994,
          },
          "pinId": "Q1.2",
          "side": "y-",
        },
        "Q1.3": {
          "offset": {
            "x": -0.4185974445,
            "y": -0.10250625000000019,
          },
          "pinId": "Q1.3",
          "side": "x-",
        },
        "R2.1": {
          "offset": {
            "x": -0.0002732499999993365,
            "y": -0.5512907000000005,
          },
          "pinId": "R2.1",
          "side": "y-",
        },
        "R2.2": {
          "offset": {
            "x": 0.0002732499999993365,
            "y": 0.5512907000000002,
          },
          "pinId": "R2.2",
          "side": "y+",
        },
        "R3.1": {
          "offset": {
            "x": -0.0002732499999993365,
            "y": -0.5512907,
          },
          "pinId": "R3.1",
          "side": "y-",
        },
        "R3.2": {
          "offset": {
            "x": 0.0002732499999993365,
            "y": 0.5512907,
          },
          "pinId": "R3.2",
          "side": "y+",
        },
        "R4.1": {
          "offset": {
            "x": -0.0002732499999993365,
            "y": -0.5512907000000009,
          },
          "pinId": "R4.1",
          "side": "y-",
        },
        "R4.2": {
          "offset": {
            "x": 0.0002732499999993365,
            "y": 0.5512907,
          },
          "pinId": "R4.2",
          "side": "y+",
        },
        "R5.1": {
          "offset": {
            "x": -0.0002732499999993365,
            "y": -0.5512907000000005,
          },
          "pinId": "R5.1",
          "side": "y-",
        },
        "R5.2": {
          "offset": {
            "x": 0.0002732499999993365,
            "y": 0.5512907000000002,
          },
          "pinId": "R5.2",
          "side": "y+",
        },
        "R7.1": {
          "offset": {
            "x": -0.0002732499999993365,
            "y": -0.5512907000000005,
          },
          "pinId": "R7.1",
          "side": "y-",
        },
        "R7.2": {
          "offset": {
            "x": 0.0002732499999993365,
            "y": 0.5512907000000002,
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
      "groupMap": {},
      "groupPinMap": {},
      "netConnMap": {
        "C1.1-source_net_2": true,
        "C1.2-source_net_0": true,
        "I2C.2-source_net_2": true,
        "INT_JP.1-source_net_2": true,
        "J1.1-source_net_0": true,
        "J1.2-source_net_1": true,
        "J1.3-source_net_5": true,
        "J1.4-source_net_4": true,
        "J2.1-source_net_0": true,
        "J2.2-source_net_1": true,
        "J2.3-source_net_5": true,
        "J2.4-source_net_4": true,
        "J3.1-source_net_0": true,
        "J3.2-source_net_1": true,
        "J3.3-source_net_5": true,
        "J3.4-source_net_4": true,
        "J3.5-source_net_3": true,
        "J3.6-source_net_6": true,
        "LED.2-source_net_0": true,
        "Q1.1-source_net_1": true,
        "Q1.2-source_net_2": true,
        "Q1.3-source_net_3": true,
        "R2.1-source_net_5": true,
        "R3.2-source_net_2": true,
        "R4.1-source_net_6": true,
        "R4.1-source_net_7": true,
        "R5.1-source_net_4": true,
        "R7.1-source_net_0": true,
        "U1.1-source_net_4": true,
        "U1.2-source_net_0": true,
        "U1.3-source_net_0": true,
        "U1.4-source_net_2": true,
        "U1.5-source_net_6": true,
        "U1.6-source_net_5": true,
      },
      "netMap": {
        "source_net_0": {
          "netId": "source_net_0",
        },
        "source_net_1": {
          "netId": "source_net_1",
        },
        "source_net_2": {
          "netId": "source_net_2",
        },
        "source_net_3": {
          "netId": "source_net_3",
        },
        "source_net_4": {
          "netId": "source_net_4",
        },
        "source_net_5": {
          "netId": "source_net_5",
        },
        "source_net_6": {
          "netId": "source_net_6",
        },
        "source_net_7": {
          "netId": "source_net_7",
        },
      },
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
