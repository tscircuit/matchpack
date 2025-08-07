import { test, expect } from "bun:test"
import { getExampleCircuitJson } from "../assets/ExampleCircuit01"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

test("getInputProblemFromCircuitJsonSchematic01", () => {
  const circuitJson = getExampleCircuitJson()

  console.log(circuitJson)

  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson)

  expect(problem).toMatchInlineSnapshot(`
    {
      "chipMap": {
        "source_component_0": {
          "chipId": "source_component_0",
          "pins": [
            "source_port_0",
            "source_port_1",
          ],
          "size": {
            "x": 0.40790845000000175,
            "y": 1.0583332999999997,
          },
        },
        "source_component_1": {
          "chipId": "source_component_1",
          "pins": [
            "source_port_2",
            "source_port_3",
            "source_port_4",
          ],
          "size": {
            "x": 0.8935117710000002,
            "y": 1.1601665819999987,
          },
        },
        "source_component_10": {
          "chipId": "source_component_10",
          "pins": [
            "source_port_34",
            "source_port_35",
          ],
          "size": {
            "x": 0.40790845000000175,
            "y": 1.0583332999999997,
          },
        },
        "source_component_11": {
          "chipId": "source_component_11",
          "pins": [
            "source_port_36",
            "source_port_37",
          ],
          "size": {
            "x": 0.6221256000000088,
            "y": 1.0521572000000003,
          },
        },
        "source_component_12": {
          "chipId": "source_component_12",
          "pins": [
            "source_port_38",
            "source_port_39",
          ],
          "size": {
            "x": 0.30829299999999904,
            "y": 0.8811970999999998,
          },
        },
        "source_component_13": {
          "chipId": "source_component_13",
          "pins": [
            "source_port_40",
            "source_port_41",
          ],
          "size": {
            "x": 0.30829299999999904,
            "y": 0.8811970999999998,
          },
        },
        "source_component_14": {
          "chipId": "source_component_14",
          "pins": [
            "source_port_42",
            "source_port_43",
          ],
          "size": {
            "x": 0.40790845000000175,
            "y": 1.0583332999999997,
          },
        },
        "source_component_2": {
          "chipId": "source_component_2",
          "pins": [
            "source_port_5",
            "source_port_6",
            "source_port_7",
            "source_port_8",
            "source_port_9",
            "source_port_10",
          ],
          "size": {
            "x": 1.2000000000000002,
            "y": 0.8,
          },
        },
        "source_component_3": {
          "chipId": "source_component_3",
          "pins": [
            "source_port_11",
            "source_port_12",
          ],
          "size": {
            "x": 0.5291665999999999,
            "y": 1.0583333000000001,
          },
        },
        "source_component_4": {
          "chipId": "source_component_4",
          "pins": [
            "source_port_13",
            "source_port_14",
            "source_port_15",
          ],
          "size": {
            "x": 0.8843008999999997,
            "y": 0.5299361999999987,
          },
        },
        "source_component_5": {
          "chipId": "source_component_5",
          "pins": [
            "source_port_16",
            "source_port_17",
          ],
          "size": {
            "x": 0.40790845000000175,
            "y": 1.0583332999999997,
          },
        },
        "source_component_6": {
          "chipId": "source_component_6",
          "pins": [
            "source_port_18",
            "source_port_19",
          ],
          "size": {
            "x": 0.40790845000000175,
            "y": 1.0583332999999997,
          },
        },
        "source_component_7": {
          "chipId": "source_component_7",
          "pins": [
            "source_port_20",
            "source_port_21",
            "source_port_22",
            "source_port_23",
            "source_port_24",
            "source_port_25",
          ],
          "size": {
            "x": 0.4,
            "y": 1.4,
          },
        },
        "source_component_8": {
          "chipId": "source_component_8",
          "pins": [
            "source_port_26",
            "source_port_27",
            "source_port_28",
            "source_port_29",
          ],
          "size": {
            "x": 0.6,
            "y": 1,
          },
        },
        "source_component_9": {
          "chipId": "source_component_9",
          "pins": [
            "source_port_30",
            "source_port_31",
            "source_port_32",
            "source_port_33",
          ],
          "size": {
            "x": 0.6,
            "y": 1,
          },
        },
      },
      "chipPinMap": {
        "source_port_0": {
          "offset": {
            "x": -0.0002732499999993365,
            "y": -0.5512907000000005,
          },
          "pinId": "source_port_0",
          "side": "y-",
        },
        "source_port_1": {
          "offset": {
            "x": 0.0002732499999993365,
            "y": 0.5512907000000002,
          },
          "pinId": "source_port_1",
          "side": "y+",
        },
        "source_port_10": {
          "offset": {
            "x": 1,
            "y": 0,
          },
          "pinId": "source_port_10",
          "side": "x+",
        },
        "source_port_11": {
          "offset": {
            "x": -0.00027334999999961695,
            "y": 0.5512093000000002,
          },
          "pinId": "source_port_11",
          "side": "y+",
        },
        "source_port_12": {
          "offset": {
            "x": 0.00027334999999961695,
            "y": -0.5512093000000002,
          },
          "pinId": "source_port_12",
          "side": "y-",
        },
        "source_port_13": {
          "offset": {
            "x": 0.44580080000000066,
            "y": -0.10158727049999955,
          },
          "pinId": "source_port_13",
          "side": "x+",
        },
        "source_port_14": {
          "offset": {
            "x": 0.0034928000000000736,
            "y": 0.25259902949999957,
          },
          "pinId": "source_port_14",
          "side": "y+",
        },
        "source_port_15": {
          "offset": {
            "x": -0.44580080000000066,
            "y": -0.10146287049999964,
          },
          "pinId": "source_port_15",
          "side": "x-",
        },
        "source_port_16": {
          "offset": {
            "x": -0.0002732499999993365,
            "y": -0.5512907000000005,
          },
          "pinId": "source_port_16",
          "side": "y-",
        },
        "source_port_17": {
          "offset": {
            "x": 0.0002732499999993365,
            "y": 0.5512907000000002,
          },
          "pinId": "source_port_17",
          "side": "y+",
        },
        "source_port_18": {
          "offset": {
            "x": -0.0002732499999993365,
            "y": -0.5512907000000005,
          },
          "pinId": "source_port_18",
          "side": "y-",
        },
        "source_port_19": {
          "offset": {
            "x": 0.0002732499999993365,
            "y": 0.5512907000000002,
          },
          "pinId": "source_port_19",
          "side": "y+",
        },
        "source_port_2": {
          "offset": {
            "x": 0.30397715550000004,
            "y": 0.5519248499999994,
          },
          "pinId": "source_port_2",
          "side": "y+",
        },
        "source_port_20": {
          "offset": {
            "x": 0.6000000000000001,
            "y": -0.5,
          },
          "pinId": "source_port_20",
          "side": "x+",
        },
        "source_port_21": {
          "offset": {
            "x": 0.6000000000000001,
            "y": -0.2999999999999998,
          },
          "pinId": "source_port_21",
          "side": "x+",
        },
        "source_port_22": {
          "offset": {
            "x": 0.6000000000000001,
            "y": -0.09999999999999964,
          },
          "pinId": "source_port_22",
          "side": "x+",
        },
        "source_port_23": {
          "offset": {
            "x": 0.6000000000000001,
            "y": 0.09999999999999964,
          },
          "pinId": "source_port_23",
          "side": "x+",
        },
        "source_port_24": {
          "offset": {
            "x": 0.6000000000000001,
            "y": 0.2999999999999998,
          },
          "pinId": "source_port_24",
          "side": "x+",
        },
        "source_port_25": {
          "offset": {
            "x": 0.6000000000000001,
            "y": 0.5,
          },
          "pinId": "source_port_25",
          "side": "x+",
        },
        "source_port_26": {
          "offset": {
            "x": 0.7000000000000002,
            "y": -0.2999999999999998,
          },
          "pinId": "source_port_26",
          "side": "x+",
        },
        "source_port_27": {
          "offset": {
            "x": 0.7000000000000002,
            "y": -0.09999999999999964,
          },
          "pinId": "source_port_27",
          "side": "x+",
        },
        "source_port_28": {
          "offset": {
            "x": 0.7000000000000002,
            "y": 0.09999999999999964,
          },
          "pinId": "source_port_28",
          "side": "x+",
        },
        "source_port_29": {
          "offset": {
            "x": 0.7000000000000002,
            "y": 0.2999999999999998,
          },
          "pinId": "source_port_29",
          "side": "x+",
        },
        "source_port_3": {
          "offset": {
            "x": 0.31067575550000137,
            "y": -0.5519248499999994,
          },
          "pinId": "source_port_3",
          "side": "y-",
        },
        "source_port_30": {
          "offset": {
            "x": 0.7000000000000002,
            "y": -0.2999999999999998,
          },
          "pinId": "source_port_30",
          "side": "x+",
        },
        "source_port_31": {
          "offset": {
            "x": 0.7000000000000002,
            "y": -0.09999999999999964,
          },
          "pinId": "source_port_31",
          "side": "x+",
        },
        "source_port_32": {
          "offset": {
            "x": 0.7000000000000002,
            "y": 0.09999999999999964,
          },
          "pinId": "source_port_32",
          "side": "x+",
        },
        "source_port_33": {
          "offset": {
            "x": 0.7000000000000002,
            "y": 0.2999999999999998,
          },
          "pinId": "source_port_33",
          "side": "x+",
        },
        "source_port_34": {
          "offset": {
            "x": -0.0002732499999993365,
            "y": -0.5512907,
          },
          "pinId": "source_port_34",
          "side": "y-",
        },
        "source_port_35": {
          "offset": {
            "x": 0.0002732499999993365,
            "y": 0.5512907,
          },
          "pinId": "source_port_35",
          "side": "y+",
        },
        "source_port_36": {
          "offset": {
            "x": 0.004432900000001183,
            "y": 0.5362093000000003,
          },
          "pinId": "source_port_36",
          "side": "y+",
        },
        "source_port_37": {
          "offset": {
            "x": 0.004886400000003732,
            "y": -0.5362092999999994,
          },
          "pinId": "source_port_37",
          "side": "y-",
        },
        "source_port_38": {
          "offset": {
            "x": 0.00006220000000034531,
            "y": 0.44580080000000066,
          },
          "pinId": "source_port_38",
          "side": "y+",
        },
        "source_port_39": {
          "offset": {
            "x": -0.00006220000000034531,
            "y": -0.44580080000000066,
          },
          "pinId": "source_port_39",
          "side": "y-",
        },
        "source_port_4": {
          "offset": {
            "x": -0.4185974445,
            "y": -0.10250625000000019,
          },
          "pinId": "source_port_4",
          "side": "x-",
        },
        "source_port_40": {
          "offset": {
            "x": 0.00006220000000034531,
            "y": 0.4458007999999998,
          },
          "pinId": "source_port_40",
          "side": "y+",
        },
        "source_port_41": {
          "offset": {
            "x": -0.00006220000000034531,
            "y": -0.4458007999999998,
          },
          "pinId": "source_port_41",
          "side": "y-",
        },
        "source_port_42": {
          "offset": {
            "x": -0.0002732499999993365,
            "y": -0.5512907000000009,
          },
          "pinId": "source_port_42",
          "side": "y-",
        },
        "source_port_43": {
          "offset": {
            "x": 0.0002732499999993365,
            "y": 0.5512907,
          },
          "pinId": "source_port_43",
          "side": "y+",
        },
        "source_port_5": {
          "offset": {
            "x": 1,
            "y": 0.2,
          },
          "pinId": "source_port_5",
          "side": "x+",
        },
        "source_port_6": {
          "offset": {
            "x": -1,
            "y": -0.2,
          },
          "pinId": "source_port_6",
          "side": "x-",
        },
        "source_port_7": {
          "offset": {
            "x": -1,
            "y": 0,
          },
          "pinId": "source_port_7",
          "side": "x-",
        },
        "source_port_8": {
          "offset": {
            "x": -1,
            "y": 0.2,
          },
          "pinId": "source_port_8",
          "side": "x-",
        },
        "source_port_9": {
          "offset": {
            "x": 1,
            "y": -0.2,
          },
          "pinId": "source_port_9",
          "side": "x+",
        },
      },
      "groupMap": {},
      "groupPinMap": {},
      "netConnMap": {
        "source_port_0-source_net_0": true,
        "source_port_10-source_net_5": true,
        "source_port_11-source_net_2": true,
        "source_port_12-source_net_0": true,
        "source_port_14-source_net_2": true,
        "source_port_16-source_net_5": true,
        "source_port_18-source_net_4": true,
        "source_port_2-source_net_1": true,
        "source_port_20-source_net_0": true,
        "source_port_21-source_net_1": true,
        "source_port_22-source_net_5": true,
        "source_port_23-source_net_4": true,
        "source_port_24-source_net_3": true,
        "source_port_25-source_net_6": true,
        "source_port_26-source_net_0": true,
        "source_port_27-source_net_1": true,
        "source_port_28-source_net_5": true,
        "source_port_29-source_net_4": true,
        "source_port_3-source_net_2": true,
        "source_port_30-source_net_0": true,
        "source_port_31-source_net_1": true,
        "source_port_32-source_net_5": true,
        "source_port_33-source_net_4": true,
        "source_port_35-source_net_2": true,
        "source_port_39-source_net_0": true,
        "source_port_4-source_net_3": true,
        "source_port_40-source_net_2": true,
        "source_port_42-source_net_6": true,
        "source_port_42-source_net_7": true,
        "source_port_5-source_net_4": true,
        "source_port_6-source_net_0": true,
        "source_port_7-source_net_0": true,
        "source_port_8-source_net_2": true,
        "source_port_9-source_net_6": true,
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
      "pinConnMap": {
        "source_port_0-source_port_12": true,
        "source_port_0-source_port_20": true,
        "source_port_0-source_port_26": true,
        "source_port_0-source_port_30": true,
        "source_port_0-source_port_39": true,
        "source_port_0-source_port_6": true,
        "source_port_0-source_port_7": true,
        "source_port_1-source_port_24": true,
        "source_port_1-source_port_4": true,
        "source_port_10-source_port_16": true,
        "source_port_10-source_port_22": true,
        "source_port_10-source_port_28": true,
        "source_port_10-source_port_32": true,
        "source_port_11-source_port_14": true,
        "source_port_11-source_port_3": true,
        "source_port_11-source_port_35": true,
        "source_port_11-source_port_40": true,
        "source_port_11-source_port_8": true,
        "source_port_12-source_port_0": true,
        "source_port_12-source_port_20": true,
        "source_port_12-source_port_26": true,
        "source_port_12-source_port_30": true,
        "source_port_12-source_port_39": true,
        "source_port_12-source_port_6": true,
        "source_port_12-source_port_7": true,
        "source_port_13-source_port_19": true,
        "source_port_14-source_port_11": true,
        "source_port_14-source_port_3": true,
        "source_port_14-source_port_35": true,
        "source_port_14-source_port_40": true,
        "source_port_14-source_port_8": true,
        "source_port_15-source_port_17": true,
        "source_port_16-source_port_10": true,
        "source_port_16-source_port_22": true,
        "source_port_16-source_port_28": true,
        "source_port_16-source_port_32": true,
        "source_port_17-source_port_15": true,
        "source_port_18-source_port_23": true,
        "source_port_18-source_port_29": true,
        "source_port_18-source_port_33": true,
        "source_port_18-source_port_5": true,
        "source_port_19-source_port_13": true,
        "source_port_2-source_port_21": true,
        "source_port_2-source_port_27": true,
        "source_port_2-source_port_31": true,
        "source_port_20-source_port_0": true,
        "source_port_20-source_port_12": true,
        "source_port_20-source_port_26": true,
        "source_port_20-source_port_30": true,
        "source_port_20-source_port_39": true,
        "source_port_20-source_port_6": true,
        "source_port_20-source_port_7": true,
        "source_port_21-source_port_2": true,
        "source_port_21-source_port_27": true,
        "source_port_21-source_port_31": true,
        "source_port_22-source_port_10": true,
        "source_port_22-source_port_16": true,
        "source_port_22-source_port_28": true,
        "source_port_22-source_port_32": true,
        "source_port_23-source_port_18": true,
        "source_port_23-source_port_29": true,
        "source_port_23-source_port_33": true,
        "source_port_23-source_port_5": true,
        "source_port_24-source_port_1": true,
        "source_port_24-source_port_4": true,
        "source_port_25-source_port_42": true,
        "source_port_25-source_port_9": true,
        "source_port_26-source_port_0": true,
        "source_port_26-source_port_12": true,
        "source_port_26-source_port_20": true,
        "source_port_26-source_port_30": true,
        "source_port_26-source_port_39": true,
        "source_port_26-source_port_6": true,
        "source_port_26-source_port_7": true,
        "source_port_27-source_port_2": true,
        "source_port_27-source_port_21": true,
        "source_port_27-source_port_31": true,
        "source_port_28-source_port_10": true,
        "source_port_28-source_port_16": true,
        "source_port_28-source_port_22": true,
        "source_port_28-source_port_32": true,
        "source_port_29-source_port_18": true,
        "source_port_29-source_port_23": true,
        "source_port_29-source_port_33": true,
        "source_port_29-source_port_5": true,
        "source_port_3-source_port_11": true,
        "source_port_3-source_port_14": true,
        "source_port_3-source_port_35": true,
        "source_port_3-source_port_40": true,
        "source_port_3-source_port_8": true,
        "source_port_30-source_port_0": true,
        "source_port_30-source_port_12": true,
        "source_port_30-source_port_20": true,
        "source_port_30-source_port_26": true,
        "source_port_30-source_port_39": true,
        "source_port_30-source_port_6": true,
        "source_port_30-source_port_7": true,
        "source_port_31-source_port_2": true,
        "source_port_31-source_port_21": true,
        "source_port_31-source_port_27": true,
        "source_port_32-source_port_10": true,
        "source_port_32-source_port_16": true,
        "source_port_32-source_port_22": true,
        "source_port_32-source_port_28": true,
        "source_port_33-source_port_18": true,
        "source_port_33-source_port_23": true,
        "source_port_33-source_port_29": true,
        "source_port_33-source_port_5": true,
        "source_port_34-source_port_36": true,
        "source_port_35-source_port_11": true,
        "source_port_35-source_port_14": true,
        "source_port_35-source_port_3": true,
        "source_port_35-source_port_40": true,
        "source_port_35-source_port_8": true,
        "source_port_36-source_port_34": true,
        "source_port_37-source_port_38": true,
        "source_port_38-source_port_37": true,
        "source_port_39-source_port_0": true,
        "source_port_39-source_port_12": true,
        "source_port_39-source_port_20": true,
        "source_port_39-source_port_26": true,
        "source_port_39-source_port_30": true,
        "source_port_39-source_port_6": true,
        "source_port_39-source_port_7": true,
        "source_port_4-source_port_1": true,
        "source_port_4-source_port_24": true,
        "source_port_40-source_port_11": true,
        "source_port_40-source_port_14": true,
        "source_port_40-source_port_3": true,
        "source_port_40-source_port_35": true,
        "source_port_40-source_port_8": true,
        "source_port_41-source_port_43": true,
        "source_port_42-source_port_25": true,
        "source_port_42-source_port_9": true,
        "source_port_43-source_port_41": true,
        "source_port_5-source_port_18": true,
        "source_port_5-source_port_23": true,
        "source_port_5-source_port_29": true,
        "source_port_5-source_port_33": true,
        "source_port_6-source_port_0": true,
        "source_port_6-source_port_12": true,
        "source_port_6-source_port_20": true,
        "source_port_6-source_port_26": true,
        "source_port_6-source_port_30": true,
        "source_port_6-source_port_39": true,
        "source_port_6-source_port_7": true,
        "source_port_7-source_port_0": true,
        "source_port_7-source_port_12": true,
        "source_port_7-source_port_20": true,
        "source_port_7-source_port_26": true,
        "source_port_7-source_port_30": true,
        "source_port_7-source_port_39": true,
        "source_port_7-source_port_6": true,
        "source_port_8-source_port_11": true,
        "source_port_8-source_port_14": true,
        "source_port_8-source_port_3": true,
        "source_port_8-source_port_35": true,
        "source_port_8-source_port_40": true,
        "source_port_9-source_port_25": true,
        "source_port_9-source_port_42": true,
      },
    }
  `)
})
