import { useMemo } from "react"
import { GenericSolverDebugger } from "lib/components/GenericSolverDebugger"
import { PartitionPackingSolver } from "lib/solvers/PartitionPackingSolver/PartitionPackingSolver"
import { PinRangeOverlapSolver } from "lib/solvers/PinRangeOverlapSolver/PinRangeOverlapSolver"

export const partitionPackingSolverInputs = [
  {
    MAX_ITERATIONS: 1000,
    solved: true,
    failed: false,
    iterations: 1,
    progress: 0,
    error: null,
    stats: {},
    pinRangeLayoutSolver: {
      MAX_ITERATIONS: 1000,
      solved: true,
      failed: false,
      iterations: 17,
      progress: 0,
      error: null,
      stats: {},
      pinRanges: [
        {
          pinIds: ["U1.4"],
          side: "x-",
          chipId: "U1",
          connectedPins: ["C5.1", "C5.2"],
          connectedChips: ["C5"],
        },
        {
          pinIds: ["U1.3", "U1.2", "U1.1"],
          side: "x-",
          chipId: "U1",
          connectedPins: ["C6.1", "C6.2", "C1.1", "C1.2", "C2.1", "C2.2"],
          connectedChips: ["C6", "C1", "C2"],
        },
        {
          pinIds: ["U1.5", "U1.6", "U1.7"],
          side: "x+",
          chipId: "U1",
          connectedPins: [],
          connectedChips: [],
        },
        {
          pinIds: ["U1.8"],
          side: "x+",
          chipId: "U1",
          connectedPins: [],
          connectedChips: [],
        },
        {
          pinIds: ["U2.4"],
          side: "x-",
          chipId: "U2",
          connectedPins: [],
          connectedChips: [],
        },
        {
          pinIds: ["U2.3", "U2.2", "U2.1"],
          side: "x-",
          chipId: "U2",
          connectedPins: [],
          connectedChips: [],
        },
        {
          pinIds: ["U2.5", "U2.6", "U2.7"],
          side: "x+",
          chipId: "U2",
          connectedPins: [],
          connectedChips: [],
        },
        {
          pinIds: ["U2.8"],
          side: "x+",
          chipId: "U2",
          connectedPins: [],
          connectedChips: [],
        },
      ],
      inputProblems: [
        {
          chipMap: {
            C6: {
              chipId: "C6",
              pins: ["C6.1", "C6.2"],
              size: {
                x: 0.5291665999999999,
                y: 1.0583333000000001,
              },
            },
            U1: {
              chipId: "U1",
              pins: [
                "U1.1",
                "U1.2",
                "U1.3",
                "U1.4",
                "U1.5",
                "U1.6",
                "U1.7",
                "U1.8",
              ],
              size: {
                x: 1.2000000000000002,
                y: 1,
              },
            },
            C5: {
              chipId: "C5",
              pins: ["C5.1", "C5.2"],
              size: {
                x: 0.5291665999999999,
                y: 1.0583333000000001,
              },
            },
            C2: {
              chipId: "C2",
              pins: ["C2.1", "C2.2"],
              size: {
                x: 0.5291665999999999,
                y: 1.0583333000000001,
              },
            },
            C1: {
              chipId: "C1",
              pins: ["C1.1", "C1.2"],
              size: {
                x: 0.5291665999999999,
                y: 1.0583333000000001,
              },
            },
          },
          chipPinMap: {
            "C6.1": {
              pinId: "C6.1",
              offset: {
                x: -0.00027334999999961695,
                y: 0.5512093000000002,
              },
              side: "y+",
            },
            "C6.2": {
              pinId: "C6.2",
              offset: {
                x: 0.00027334999999961695,
                y: -0.5512093000000002,
              },
              side: "y-",
            },
            "U1.1": {
              pinId: "U1.1",
              offset: {
                x: -1,
                y: 0.30000000000000004,
              },
              side: "x-",
            },
            "U1.2": {
              pinId: "U1.2",
              offset: {
                x: -1,
                y: 0.10000000000000003,
              },
              side: "x-",
            },
            "U1.3": {
              pinId: "U1.3",
              offset: {
                x: -1,
                y: -0.09999999999999998,
              },
              side: "x-",
            },
            "U1.4": {
              pinId: "U1.4",
              offset: {
                x: -1,
                y: -0.30000000000000004,
              },
              side: "x-",
            },
            "U1.5": {
              pinId: "U1.5",
              offset: {
                x: 1,
                y: -0.30000000000000004,
              },
              side: "x+",
            },
            "U1.6": {
              pinId: "U1.6",
              offset: {
                x: 1,
                y: -0.10000000000000003,
              },
              side: "x+",
            },
            "U1.7": {
              pinId: "U1.7",
              offset: {
                x: 1,
                y: 0.09999999999999998,
              },
              side: "x+",
            },
            "U1.8": {
              pinId: "U1.8",
              offset: {
                x: 1,
                y: 0.30000000000000004,
              },
              side: "x+",
            },
            "C5.1": {
              pinId: "C5.1",
              offset: {
                x: -0.000273349999999839,
                y: 0.5512093000000002,
              },
              side: "y+",
            },
            "C5.2": {
              pinId: "C5.2",
              offset: {
                x: 0.00027334999999961695,
                y: -0.5512093000000002,
              },
              side: "y-",
            },
            "C2.1": {
              pinId: "C2.1",
              offset: {
                x: -0.00027334999999961695,
                y: 0.5512093000000002,
              },
              side: "y+",
            },
            "C2.2": {
              pinId: "C2.2",
              offset: {
                x: 0.00027335000000006104,
                y: -0.5512093000000002,
              },
              side: "y-",
            },
            "C1.1": {
              pinId: "C1.1",
              offset: {
                x: -0.00027335000000006104,
                y: 0.5512093000000002,
              },
              side: "y+",
            },
            "C1.2": {
              pinId: "C1.2",
              offset: {
                x: 0.00027334999999961695,
                y: -0.5512093000000002,
              },
              side: "y-",
            },
          },
          groupMap: {},
          groupPinMap: {},
          netMap: {
            VSYS: {
              netId: "VSYS",
            },
            GND: {
              netId: "GND",
            },
            V3_3: {
              netId: "V3_3",
            },
          },
          pinStrongConnMap: {
            "U1.1-C6.1": true,
            "C6.1-U1.1": true,
            "U1.1-C1.1": true,
            "C1.1-U1.1": true,
            "U1.1-C2.1": true,
            "C2.1-U1.1": true,
            "U1.2-C6.2": true,
            "C6.2-U1.2": true,
            "U1.2-C1.2": true,
            "C1.2-U1.2": true,
            "U1.2-C2.2": true,
            "C2.2-U1.2": true,
            "U1.3-U1.1": true,
            "U1.1-U1.3": true,
            "U1.4-C5.1": true,
            "C5.1-U1.4": true,
          },
          netConnMap: {
            "U1.1-VSYS": true,
            "U1.2-GND": true,
            "U1.4-V3_3": true,
            "C5.2-GND": true,
          },
        },
        {
          chipMap: {
            U2: {
              chipId: "U2",
              pins: [
                "U2.1",
                "U2.2",
                "U2.3",
                "U2.4",
                "U2.5",
                "U2.6",
                "U2.7",
                "U2.8",
              ],
              size: {
                x: 1.2000000000000002,
                y: 1,
              },
            },
          },
          chipPinMap: {
            "U2.1": {
              pinId: "U2.1",
              offset: {
                x: -1,
                y: 0.30000000000000004,
              },
              side: "x-",
            },
            "U2.2": {
              pinId: "U2.2",
              offset: {
                x: -1,
                y: 0.10000000000000003,
              },
              side: "x-",
            },
            "U2.3": {
              pinId: "U2.3",
              offset: {
                x: -1,
                y: -0.09999999999999998,
              },
              side: "x-",
            },
            "U2.4": {
              pinId: "U2.4",
              offset: {
                x: -1,
                y: -0.30000000000000004,
              },
              side: "x-",
            },
            "U2.5": {
              pinId: "U2.5",
              offset: {
                x: 1,
                y: -0.30000000000000004,
              },
              side: "x+",
            },
            "U2.6": {
              pinId: "U2.6",
              offset: {
                x: 1,
                y: -0.10000000000000003,
              },
              side: "x+",
            },
            "U2.7": {
              pinId: "U2.7",
              offset: {
                x: 1,
                y: 0.09999999999999998,
              },
              side: "x+",
            },
            "U2.8": {
              pinId: "U2.8",
              offset: {
                x: 1,
                y: 0.30000000000000004,
              },
              side: "x+",
            },
          },
          groupMap: {},
          groupPinMap: {},
          netMap: {
            VCC: {
              netId: "VCC",
            },
            GND: {
              netId: "GND",
            },
          },
          pinStrongConnMap: {},
          netConnMap: {
            "U2.1-VCC": true,
            "U2.2-GND": true,
          },
        },
      ],
      currentRangeIndex: 8,
      activeSolver: null,
      completedSolvers: [
        {
          MAX_ITERATIONS: 1000,
          solved: true,
          failed: false,
          iterations: 1,
          progress: 0,
          error: null,
          stats: {},
          pinRange: {
            pinIds: ["U1.4"],
            side: "x-",
            chipId: "U1",
            connectedPins: ["C5.1", "C5.2"],
            connectedChips: ["C5"],
          },
          inputProblem: {
            chipMap: {
              C6: {
                chipId: "C6",
                pins: ["C6.1", "C6.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
              U1: {
                chipId: "U1",
                pins: [
                  "U1.1",
                  "U1.2",
                  "U1.3",
                  "U1.4",
                  "U1.5",
                  "U1.6",
                  "U1.7",
                  "U1.8",
                ],
                size: {
                  x: 1.2000000000000002,
                  y: 1,
                },
              },
              C5: {
                chipId: "C5",
                pins: ["C5.1", "C5.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
              C2: {
                chipId: "C2",
                pins: ["C2.1", "C2.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
              C1: {
                chipId: "C1",
                pins: ["C1.1", "C1.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
            },
            chipPinMap: {
              "C6.1": {
                pinId: "C6.1",
                offset: {
                  x: -0.00027334999999961695,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C6.2": {
                pinId: "C6.2",
                offset: {
                  x: 0.00027334999999961695,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
              "U1.1": {
                pinId: "U1.1",
                offset: {
                  x: -1,
                  y: 0.30000000000000004,
                },
                side: "x-",
              },
              "U1.2": {
                pinId: "U1.2",
                offset: {
                  x: -1,
                  y: 0.10000000000000003,
                },
                side: "x-",
              },
              "U1.3": {
                pinId: "U1.3",
                offset: {
                  x: -1,
                  y: -0.09999999999999998,
                },
                side: "x-",
              },
              "U1.4": {
                pinId: "U1.4",
                offset: {
                  x: -1,
                  y: -0.30000000000000004,
                },
                side: "x-",
              },
              "U1.5": {
                pinId: "U1.5",
                offset: {
                  x: 1,
                  y: -0.30000000000000004,
                },
                side: "x+",
              },
              "U1.6": {
                pinId: "U1.6",
                offset: {
                  x: 1,
                  y: -0.10000000000000003,
                },
                side: "x+",
              },
              "U1.7": {
                pinId: "U1.7",
                offset: {
                  x: 1,
                  y: 0.09999999999999998,
                },
                side: "x+",
              },
              "U1.8": {
                pinId: "U1.8",
                offset: {
                  x: 1,
                  y: 0.30000000000000004,
                },
                side: "x+",
              },
              "C5.1": {
                pinId: "C5.1",
                offset: {
                  x: -0.000273349999999839,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C5.2": {
                pinId: "C5.2",
                offset: {
                  x: 0.00027334999999961695,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
              "C2.1": {
                pinId: "C2.1",
                offset: {
                  x: -0.00027334999999961695,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C2.2": {
                pinId: "C2.2",
                offset: {
                  x: 0.00027335000000006104,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
              "C1.1": {
                pinId: "C1.1",
                offset: {
                  x: -0.00027335000000006104,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C1.2": {
                pinId: "C1.2",
                offset: {
                  x: 0.00027334999999961695,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
            },
            groupMap: {},
            groupPinMap: {},
            netMap: {
              VSYS: {
                netId: "VSYS",
              },
              GND: {
                netId: "GND",
              },
              V3_3: {
                netId: "V3_3",
              },
            },
            pinStrongConnMap: {
              "U1.1-C6.1": true,
              "C6.1-U1.1": true,
              "U1.1-C1.1": true,
              "C1.1-U1.1": true,
              "U1.1-C2.1": true,
              "C2.1-U1.1": true,
              "U1.2-C6.2": true,
              "C6.2-U1.2": true,
              "U1.2-C1.2": true,
              "C1.2-U1.2": true,
              "U1.2-C2.2": true,
              "C2.2-U1.2": true,
              "U1.3-U1.1": true,
              "U1.1-U1.3": true,
              "U1.4-C5.1": true,
              "C5.1-U1.4": true,
            },
            netConnMap: {
              "U1.1-VSYS": true,
              "U1.2-GND": true,
              "U1.4-V3_3": true,
              "C5.2-GND": true,
            },
          },
          layoutApplied: true,
          layout: {
            chipPlacements: {
              U1: {
                x: 0,
                y: 0,
                ccwRotationDegrees: 0,
              },
              C5: {
                x: -1.7538933,
                y: -1.004771698352237,
                ccwRotationDegrees: 0,
              },
            },
            groupPlacements: {},
          },
          debugPackInput: {
            components: [
              {
                componentId: "U1",
                pads: [
                  {
                    padId: "U1.1",
                    networkId: "disconnected_0",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.2",
                    networkId: "disconnected_1",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.3",
                    networkId: "disconnected_2",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.4",
                    networkId: "C5.1",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.5",
                    networkId: "disconnected_3",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.6",
                    networkId: "disconnected_4",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.7",
                    networkId: "disconnected_5",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.8",
                    networkId: "disconnected_6",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1-body",
                    networkId: "disconnected_7",
                    type: "rect",
                    offset: {
                      x: 0,
                      y: 0,
                    },
                    size: {
                      x: 1.2000000000000002,
                      y: 1,
                    },
                  },
                ],
              },
              {
                componentId: "C5",
                pads: [
                  {
                    padId: "C5.1",
                    networkId: "C5.1",
                    type: "rect",
                    offset: {
                      x: -0.000273349999999839,
                      y: 0.5512093000000002,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "C5.2",
                    networkId: "disconnected_8",
                    type: "rect",
                    offset: {
                      x: 0.00027334999999961695,
                      y: -0.5512093000000002,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "C5-body",
                    networkId: "disconnected_9",
                    type: "rect",
                    offset: {
                      x: 0,
                      y: 0,
                    },
                    size: {
                      x: 0.5291665999999999,
                      y: 1.0583333000000001,
                    },
                  },
                ],
              },
            ],
            minGap: 0.2,
            packOrderStrategy: "largest_to_smallest",
            packPlacementStrategy: "minimum_sum_squared_distance_to_network",
          },
        },
        {
          MAX_ITERATIONS: 1000,
          solved: true,
          failed: false,
          iterations: 1,
          progress: 0,
          error: null,
          stats: {},
          pinRange: {
            pinIds: ["U1.3", "U1.2", "U1.1"],
            side: "x-",
            chipId: "U1",
            connectedPins: ["C6.1", "C6.2", "C1.1", "C1.2", "C2.1", "C2.2"],
            connectedChips: ["C6", "C1", "C2"],
          },
          inputProblem: {
            chipMap: {
              C6: {
                chipId: "C6",
                pins: ["C6.1", "C6.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
              U1: {
                chipId: "U1",
                pins: [
                  "U1.1",
                  "U1.2",
                  "U1.3",
                  "U1.4",
                  "U1.5",
                  "U1.6",
                  "U1.7",
                  "U1.8",
                ],
                size: {
                  x: 1.2000000000000002,
                  y: 1,
                },
              },
              C5: {
                chipId: "C5",
                pins: ["C5.1", "C5.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
              C2: {
                chipId: "C2",
                pins: ["C2.1", "C2.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
              C1: {
                chipId: "C1",
                pins: ["C1.1", "C1.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
            },
            chipPinMap: {
              "C6.1": {
                pinId: "C6.1",
                offset: {
                  x: -0.00027334999999961695,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C6.2": {
                pinId: "C6.2",
                offset: {
                  x: 0.00027334999999961695,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
              "U1.1": {
                pinId: "U1.1",
                offset: {
                  x: -1,
                  y: 0.30000000000000004,
                },
                side: "x-",
              },
              "U1.2": {
                pinId: "U1.2",
                offset: {
                  x: -1,
                  y: 0.10000000000000003,
                },
                side: "x-",
              },
              "U1.3": {
                pinId: "U1.3",
                offset: {
                  x: -1,
                  y: -0.09999999999999998,
                },
                side: "x-",
              },
              "U1.4": {
                pinId: "U1.4",
                offset: {
                  x: -1,
                  y: -0.30000000000000004,
                },
                side: "x-",
              },
              "U1.5": {
                pinId: "U1.5",
                offset: {
                  x: 1,
                  y: -0.30000000000000004,
                },
                side: "x+",
              },
              "U1.6": {
                pinId: "U1.6",
                offset: {
                  x: 1,
                  y: -0.10000000000000003,
                },
                side: "x+",
              },
              "U1.7": {
                pinId: "U1.7",
                offset: {
                  x: 1,
                  y: 0.09999999999999998,
                },
                side: "x+",
              },
              "U1.8": {
                pinId: "U1.8",
                offset: {
                  x: 1,
                  y: 0.30000000000000004,
                },
                side: "x+",
              },
              "C5.1": {
                pinId: "C5.1",
                offset: {
                  x: -0.000273349999999839,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C5.2": {
                pinId: "C5.2",
                offset: {
                  x: 0.00027334999999961695,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
              "C2.1": {
                pinId: "C2.1",
                offset: {
                  x: -0.00027334999999961695,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C2.2": {
                pinId: "C2.2",
                offset: {
                  x: 0.00027335000000006104,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
              "C1.1": {
                pinId: "C1.1",
                offset: {
                  x: -0.00027335000000006104,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C1.2": {
                pinId: "C1.2",
                offset: {
                  x: 0.00027334999999961695,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
            },
            groupMap: {},
            groupPinMap: {},
            netMap: {
              VSYS: {
                netId: "VSYS",
              },
              GND: {
                netId: "GND",
              },
              V3_3: {
                netId: "V3_3",
              },
            },
            pinStrongConnMap: {
              "U1.1-C6.1": true,
              "C6.1-U1.1": true,
              "U1.1-C1.1": true,
              "C1.1-U1.1": true,
              "U1.1-C2.1": true,
              "C2.1-U1.1": true,
              "U1.2-C6.2": true,
              "C6.2-U1.2": true,
              "U1.2-C1.2": true,
              "C1.2-U1.2": true,
              "U1.2-C2.2": true,
              "C2.2-U1.2": true,
              "U1.3-U1.1": true,
              "U1.1-U1.3": true,
              "U1.4-C5.1": true,
              "C5.1-U1.4": true,
            },
            netConnMap: {
              "U1.1-VSYS": true,
              "U1.2-GND": true,
              "U1.4-V3_3": true,
              "C5.2-GND": true,
            },
          },
          layoutApplied: true,
          layout: {
            chipPlacements: {
              U1: {
                x: 0,
                y: 0,
                ccwRotationDegrees: 0,
              },
              C6: {
                x: -1.75416665,
                y: 0.2535616016477631,
                ccwRotationDegrees: 180,
              },
              C1: {
                x: -1.3116260000000002,
                y: 1.2288933605067471,
                ccwRotationDegrees: 270,
              },
              C2: {
                x: -2.6167286449535703,
                y: 0.8541662613152188,
                ccwRotationDegrees: 180,
              },
            },
            groupPlacements: {},
          },
          debugPackInput: {
            components: [
              {
                componentId: "U1",
                pads: [
                  {
                    padId: "U1.1",
                    networkId: "C1.1",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.2",
                    networkId: "C1.2",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.3",
                    networkId: "C1.1",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.4",
                    networkId: "disconnected_0",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.5",
                    networkId: "disconnected_1",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.6",
                    networkId: "disconnected_2",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.7",
                    networkId: "disconnected_3",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.8",
                    networkId: "disconnected_4",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1-body",
                    networkId: "disconnected_5",
                    type: "rect",
                    offset: {
                      x: 0,
                      y: 0,
                    },
                    size: {
                      x: 1.2000000000000002,
                      y: 1,
                    },
                  },
                ],
              },
              {
                componentId: "C6",
                pads: [
                  {
                    padId: "C6.1",
                    networkId: "C1.1",
                    type: "rect",
                    offset: {
                      x: -0.00027334999999961695,
                      y: 0.5512093000000002,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "C6.2",
                    networkId: "C1.2",
                    type: "rect",
                    offset: {
                      x: 0.00027334999999961695,
                      y: -0.5512093000000002,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "C6-body",
                    networkId: "disconnected_6",
                    type: "rect",
                    offset: {
                      x: 0,
                      y: 0,
                    },
                    size: {
                      x: 0.5291665999999999,
                      y: 1.0583333000000001,
                    },
                  },
                ],
              },
              {
                componentId: "C1",
                pads: [
                  {
                    padId: "C1.1",
                    networkId: "C1.1",
                    type: "rect",
                    offset: {
                      x: -0.00027335000000006104,
                      y: 0.5512093000000002,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "C1.2",
                    networkId: "C1.2",
                    type: "rect",
                    offset: {
                      x: 0.00027334999999961695,
                      y: -0.5512093000000002,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "C1-body",
                    networkId: "disconnected_7",
                    type: "rect",
                    offset: {
                      x: 0,
                      y: 0,
                    },
                    size: {
                      x: 0.5291665999999999,
                      y: 1.0583333000000001,
                    },
                  },
                ],
              },
              {
                componentId: "C2",
                pads: [
                  {
                    padId: "C2.1",
                    networkId: "C1.1",
                    type: "rect",
                    offset: {
                      x: -0.00027334999999961695,
                      y: 0.5512093000000002,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "C2.2",
                    networkId: "C1.2",
                    type: "rect",
                    offset: {
                      x: 0.00027335000000006104,
                      y: -0.5512093000000002,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "C2-body",
                    networkId: "disconnected_8",
                    type: "rect",
                    offset: {
                      x: 0,
                      y: 0,
                    },
                    size: {
                      x: 0.5291665999999999,
                      y: 1.0583333000000001,
                    },
                  },
                ],
              },
            ],
            minGap: 0.2,
            packOrderStrategy: "largest_to_smallest",
            packPlacementStrategy: "minimum_sum_squared_distance_to_network",
          },
        },
        {
          MAX_ITERATIONS: 1000,
          solved: true,
          failed: false,
          iterations: 1,
          progress: 0,
          error: null,
          stats: {},
          pinRange: {
            pinIds: ["U1.5", "U1.6", "U1.7"],
            side: "x+",
            chipId: "U1",
            connectedPins: [],
            connectedChips: [],
          },
          inputProblem: {
            chipMap: {
              C6: {
                chipId: "C6",
                pins: ["C6.1", "C6.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
              U1: {
                chipId: "U1",
                pins: [
                  "U1.1",
                  "U1.2",
                  "U1.3",
                  "U1.4",
                  "U1.5",
                  "U1.6",
                  "U1.7",
                  "U1.8",
                ],
                size: {
                  x: 1.2000000000000002,
                  y: 1,
                },
              },
              C5: {
                chipId: "C5",
                pins: ["C5.1", "C5.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
              C2: {
                chipId: "C2",
                pins: ["C2.1", "C2.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
              C1: {
                chipId: "C1",
                pins: ["C1.1", "C1.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
            },
            chipPinMap: {
              "C6.1": {
                pinId: "C6.1",
                offset: {
                  x: -0.00027334999999961695,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C6.2": {
                pinId: "C6.2",
                offset: {
                  x: 0.00027334999999961695,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
              "U1.1": {
                pinId: "U1.1",
                offset: {
                  x: -1,
                  y: 0.30000000000000004,
                },
                side: "x-",
              },
              "U1.2": {
                pinId: "U1.2",
                offset: {
                  x: -1,
                  y: 0.10000000000000003,
                },
                side: "x-",
              },
              "U1.3": {
                pinId: "U1.3",
                offset: {
                  x: -1,
                  y: -0.09999999999999998,
                },
                side: "x-",
              },
              "U1.4": {
                pinId: "U1.4",
                offset: {
                  x: -1,
                  y: -0.30000000000000004,
                },
                side: "x-",
              },
              "U1.5": {
                pinId: "U1.5",
                offset: {
                  x: 1,
                  y: -0.30000000000000004,
                },
                side: "x+",
              },
              "U1.6": {
                pinId: "U1.6",
                offset: {
                  x: 1,
                  y: -0.10000000000000003,
                },
                side: "x+",
              },
              "U1.7": {
                pinId: "U1.7",
                offset: {
                  x: 1,
                  y: 0.09999999999999998,
                },
                side: "x+",
              },
              "U1.8": {
                pinId: "U1.8",
                offset: {
                  x: 1,
                  y: 0.30000000000000004,
                },
                side: "x+",
              },
              "C5.1": {
                pinId: "C5.1",
                offset: {
                  x: -0.000273349999999839,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C5.2": {
                pinId: "C5.2",
                offset: {
                  x: 0.00027334999999961695,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
              "C2.1": {
                pinId: "C2.1",
                offset: {
                  x: -0.00027334999999961695,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C2.2": {
                pinId: "C2.2",
                offset: {
                  x: 0.00027335000000006104,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
              "C1.1": {
                pinId: "C1.1",
                offset: {
                  x: -0.00027335000000006104,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C1.2": {
                pinId: "C1.2",
                offset: {
                  x: 0.00027334999999961695,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
            },
            groupMap: {},
            groupPinMap: {},
            netMap: {
              VSYS: {
                netId: "VSYS",
              },
              GND: {
                netId: "GND",
              },
              V3_3: {
                netId: "V3_3",
              },
            },
            pinStrongConnMap: {
              "U1.1-C6.1": true,
              "C6.1-U1.1": true,
              "U1.1-C1.1": true,
              "C1.1-U1.1": true,
              "U1.1-C2.1": true,
              "C2.1-U1.1": true,
              "U1.2-C6.2": true,
              "C6.2-U1.2": true,
              "U1.2-C1.2": true,
              "C1.2-U1.2": true,
              "U1.2-C2.2": true,
              "C2.2-U1.2": true,
              "U1.3-U1.1": true,
              "U1.1-U1.3": true,
              "U1.4-C5.1": true,
              "C5.1-U1.4": true,
            },
            netConnMap: {
              "U1.1-VSYS": true,
              "U1.2-GND": true,
              "U1.4-V3_3": true,
              "C5.2-GND": true,
            },
          },
          layoutApplied: true,
          layout: {
            chipPlacements: {
              U1: {
                x: 0,
                y: 0,
                ccwRotationDegrees: 0,
              },
            },
            groupPlacements: {},
          },
          debugPackInput: {
            components: [
              {
                componentId: "U1",
                pads: [
                  {
                    padId: "U1.1",
                    networkId: "disconnected_0",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.2",
                    networkId: "disconnected_1",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.3",
                    networkId: "disconnected_2",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.4",
                    networkId: "disconnected_3",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.5",
                    networkId: "disconnected_4",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.6",
                    networkId: "disconnected_5",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.7",
                    networkId: "disconnected_6",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.8",
                    networkId: "disconnected_7",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1-body",
                    networkId: "disconnected_8",
                    type: "rect",
                    offset: {
                      x: 0,
                      y: 0,
                    },
                    size: {
                      x: 1.2000000000000002,
                      y: 1,
                    },
                  },
                ],
              },
            ],
            minGap: 0.2,
            packOrderStrategy: "largest_to_smallest",
            packPlacementStrategy: "minimum_sum_squared_distance_to_network",
          },
        },
        {
          MAX_ITERATIONS: 1000,
          solved: true,
          failed: false,
          iterations: 1,
          progress: 0,
          error: null,
          stats: {},
          pinRange: {
            pinIds: ["U1.8"],
            side: "x+",
            chipId: "U1",
            connectedPins: [],
            connectedChips: [],
          },
          inputProblem: {
            chipMap: {
              C6: {
                chipId: "C6",
                pins: ["C6.1", "C6.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
              U1: {
                chipId: "U1",
                pins: [
                  "U1.1",
                  "U1.2",
                  "U1.3",
                  "U1.4",
                  "U1.5",
                  "U1.6",
                  "U1.7",
                  "U1.8",
                ],
                size: {
                  x: 1.2000000000000002,
                  y: 1,
                },
              },
              C5: {
                chipId: "C5",
                pins: ["C5.1", "C5.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
              C2: {
                chipId: "C2",
                pins: ["C2.1", "C2.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
              C1: {
                chipId: "C1",
                pins: ["C1.1", "C1.2"],
                size: {
                  x: 0.5291665999999999,
                  y: 1.0583333000000001,
                },
              },
            },
            chipPinMap: {
              "C6.1": {
                pinId: "C6.1",
                offset: {
                  x: -0.00027334999999961695,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C6.2": {
                pinId: "C6.2",
                offset: {
                  x: 0.00027334999999961695,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
              "U1.1": {
                pinId: "U1.1",
                offset: {
                  x: -1,
                  y: 0.30000000000000004,
                },
                side: "x-",
              },
              "U1.2": {
                pinId: "U1.2",
                offset: {
                  x: -1,
                  y: 0.10000000000000003,
                },
                side: "x-",
              },
              "U1.3": {
                pinId: "U1.3",
                offset: {
                  x: -1,
                  y: -0.09999999999999998,
                },
                side: "x-",
              },
              "U1.4": {
                pinId: "U1.4",
                offset: {
                  x: -1,
                  y: -0.30000000000000004,
                },
                side: "x-",
              },
              "U1.5": {
                pinId: "U1.5",
                offset: {
                  x: 1,
                  y: -0.30000000000000004,
                },
                side: "x+",
              },
              "U1.6": {
                pinId: "U1.6",
                offset: {
                  x: 1,
                  y: -0.10000000000000003,
                },
                side: "x+",
              },
              "U1.7": {
                pinId: "U1.7",
                offset: {
                  x: 1,
                  y: 0.09999999999999998,
                },
                side: "x+",
              },
              "U1.8": {
                pinId: "U1.8",
                offset: {
                  x: 1,
                  y: 0.30000000000000004,
                },
                side: "x+",
              },
              "C5.1": {
                pinId: "C5.1",
                offset: {
                  x: -0.000273349999999839,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C5.2": {
                pinId: "C5.2",
                offset: {
                  x: 0.00027334999999961695,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
              "C2.1": {
                pinId: "C2.1",
                offset: {
                  x: -0.00027334999999961695,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C2.2": {
                pinId: "C2.2",
                offset: {
                  x: 0.00027335000000006104,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
              "C1.1": {
                pinId: "C1.1",
                offset: {
                  x: -0.00027335000000006104,
                  y: 0.5512093000000002,
                },
                side: "y+",
              },
              "C1.2": {
                pinId: "C1.2",
                offset: {
                  x: 0.00027334999999961695,
                  y: -0.5512093000000002,
                },
                side: "y-",
              },
            },
            groupMap: {},
            groupPinMap: {},
            netMap: {
              VSYS: {
                netId: "VSYS",
              },
              GND: {
                netId: "GND",
              },
              V3_3: {
                netId: "V3_3",
              },
            },
            pinStrongConnMap: {
              "U1.1-C6.1": true,
              "C6.1-U1.1": true,
              "U1.1-C1.1": true,
              "C1.1-U1.1": true,
              "U1.1-C2.1": true,
              "C2.1-U1.1": true,
              "U1.2-C6.2": true,
              "C6.2-U1.2": true,
              "U1.2-C1.2": true,
              "C1.2-U1.2": true,
              "U1.2-C2.2": true,
              "C2.2-U1.2": true,
              "U1.3-U1.1": true,
              "U1.1-U1.3": true,
              "U1.4-C5.1": true,
              "C5.1-U1.4": true,
            },
            netConnMap: {
              "U1.1-VSYS": true,
              "U1.2-GND": true,
              "U1.4-V3_3": true,
              "C5.2-GND": true,
            },
          },
          layoutApplied: true,
          layout: {
            chipPlacements: {
              U1: {
                x: 0,
                y: 0,
                ccwRotationDegrees: 0,
              },
            },
            groupPlacements: {},
          },
          debugPackInput: {
            components: [
              {
                componentId: "U1",
                pads: [
                  {
                    padId: "U1.1",
                    networkId: "disconnected_0",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.2",
                    networkId: "disconnected_1",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.3",
                    networkId: "disconnected_2",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.4",
                    networkId: "disconnected_3",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.5",
                    networkId: "disconnected_4",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.6",
                    networkId: "disconnected_5",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.7",
                    networkId: "disconnected_6",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1.8",
                    networkId: "disconnected_7",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U1-body",
                    networkId: "disconnected_8",
                    type: "rect",
                    offset: {
                      x: 0,
                      y: 0,
                    },
                    size: {
                      x: 1.2000000000000002,
                      y: 1,
                    },
                  },
                ],
              },
            ],
            minGap: 0.2,
            packOrderStrategy: "largest_to_smallest",
            packPlacementStrategy: "minimum_sum_squared_distance_to_network",
          },
        },
        {
          MAX_ITERATIONS: 1000,
          solved: true,
          failed: false,
          iterations: 1,
          progress: 0,
          error: null,
          stats: {},
          pinRange: {
            pinIds: ["U2.4"],
            side: "x-",
            chipId: "U2",
            connectedPins: [],
            connectedChips: [],
          },
          inputProblem: {
            chipMap: {
              U2: {
                chipId: "U2",
                pins: [
                  "U2.1",
                  "U2.2",
                  "U2.3",
                  "U2.4",
                  "U2.5",
                  "U2.6",
                  "U2.7",
                  "U2.8",
                ],
                size: {
                  x: 1.2000000000000002,
                  y: 1,
                },
              },
            },
            chipPinMap: {
              "U2.1": {
                pinId: "U2.1",
                offset: {
                  x: -1,
                  y: 0.30000000000000004,
                },
                side: "x-",
              },
              "U2.2": {
                pinId: "U2.2",
                offset: {
                  x: -1,
                  y: 0.10000000000000003,
                },
                side: "x-",
              },
              "U2.3": {
                pinId: "U2.3",
                offset: {
                  x: -1,
                  y: -0.09999999999999998,
                },
                side: "x-",
              },
              "U2.4": {
                pinId: "U2.4",
                offset: {
                  x: -1,
                  y: -0.30000000000000004,
                },
                side: "x-",
              },
              "U2.5": {
                pinId: "U2.5",
                offset: {
                  x: 1,
                  y: -0.30000000000000004,
                },
                side: "x+",
              },
              "U2.6": {
                pinId: "U2.6",
                offset: {
                  x: 1,
                  y: -0.10000000000000003,
                },
                side: "x+",
              },
              "U2.7": {
                pinId: "U2.7",
                offset: {
                  x: 1,
                  y: 0.09999999999999998,
                },
                side: "x+",
              },
              "U2.8": {
                pinId: "U2.8",
                offset: {
                  x: 1,
                  y: 0.30000000000000004,
                },
                side: "x+",
              },
            },
            groupMap: {},
            groupPinMap: {},
            netMap: {
              VCC: {
                netId: "VCC",
              },
              GND: {
                netId: "GND",
              },
            },
            pinStrongConnMap: {},
            netConnMap: {
              "U2.1-VCC": true,
              "U2.2-GND": true,
            },
          },
          layoutApplied: true,
          layout: {
            chipPlacements: {
              U2: {
                x: 0,
                y: 0,
                ccwRotationDegrees: 0,
              },
            },
            groupPlacements: {},
          },
          debugPackInput: {
            components: [
              {
                componentId: "U2",
                pads: [
                  {
                    padId: "U2.1",
                    networkId: "disconnected_0",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.2",
                    networkId: "disconnected_1",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.3",
                    networkId: "disconnected_2",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.4",
                    networkId: "disconnected_3",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.5",
                    networkId: "disconnected_4",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.6",
                    networkId: "disconnected_5",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.7",
                    networkId: "disconnected_6",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.8",
                    networkId: "disconnected_7",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2-body",
                    networkId: "disconnected_8",
                    type: "rect",
                    offset: {
                      x: 0,
                      y: 0,
                    },
                    size: {
                      x: 1.2000000000000002,
                      y: 1,
                    },
                  },
                ],
              },
            ],
            minGap: 0.2,
            packOrderStrategy: "largest_to_smallest",
            packPlacementStrategy: "minimum_sum_squared_distance_to_network",
          },
        },
        {
          MAX_ITERATIONS: 1000,
          solved: true,
          failed: false,
          iterations: 1,
          progress: 0,
          error: null,
          stats: {},
          pinRange: {
            pinIds: ["U2.3", "U2.2", "U2.1"],
            side: "x-",
            chipId: "U2",
            connectedPins: [],
            connectedChips: [],
          },
          inputProblem: {
            chipMap: {
              U2: {
                chipId: "U2",
                pins: [
                  "U2.1",
                  "U2.2",
                  "U2.3",
                  "U2.4",
                  "U2.5",
                  "U2.6",
                  "U2.7",
                  "U2.8",
                ],
                size: {
                  x: 1.2000000000000002,
                  y: 1,
                },
              },
            },
            chipPinMap: {
              "U2.1": {
                pinId: "U2.1",
                offset: {
                  x: -1,
                  y: 0.30000000000000004,
                },
                side: "x-",
              },
              "U2.2": {
                pinId: "U2.2",
                offset: {
                  x: -1,
                  y: 0.10000000000000003,
                },
                side: "x-",
              },
              "U2.3": {
                pinId: "U2.3",
                offset: {
                  x: -1,
                  y: -0.09999999999999998,
                },
                side: "x-",
              },
              "U2.4": {
                pinId: "U2.4",
                offset: {
                  x: -1,
                  y: -0.30000000000000004,
                },
                side: "x-",
              },
              "U2.5": {
                pinId: "U2.5",
                offset: {
                  x: 1,
                  y: -0.30000000000000004,
                },
                side: "x+",
              },
              "U2.6": {
                pinId: "U2.6",
                offset: {
                  x: 1,
                  y: -0.10000000000000003,
                },
                side: "x+",
              },
              "U2.7": {
                pinId: "U2.7",
                offset: {
                  x: 1,
                  y: 0.09999999999999998,
                },
                side: "x+",
              },
              "U2.8": {
                pinId: "U2.8",
                offset: {
                  x: 1,
                  y: 0.30000000000000004,
                },
                side: "x+",
              },
            },
            groupMap: {},
            groupPinMap: {},
            netMap: {
              VCC: {
                netId: "VCC",
              },
              GND: {
                netId: "GND",
              },
            },
            pinStrongConnMap: {},
            netConnMap: {
              "U2.1-VCC": true,
              "U2.2-GND": true,
            },
          },
          layoutApplied: true,
          layout: {
            chipPlacements: {
              U2: {
                x: 0,
                y: 0,
                ccwRotationDegrees: 0,
              },
            },
            groupPlacements: {},
          },
          debugPackInput: {
            components: [
              {
                componentId: "U2",
                pads: [
                  {
                    padId: "U2.1",
                    networkId: "disconnected_0",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.2",
                    networkId: "disconnected_1",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.3",
                    networkId: "disconnected_2",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.4",
                    networkId: "disconnected_3",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.5",
                    networkId: "disconnected_4",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.6",
                    networkId: "disconnected_5",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.7",
                    networkId: "disconnected_6",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.8",
                    networkId: "disconnected_7",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2-body",
                    networkId: "disconnected_8",
                    type: "rect",
                    offset: {
                      x: 0,
                      y: 0,
                    },
                    size: {
                      x: 1.2000000000000002,
                      y: 1,
                    },
                  },
                ],
              },
            ],
            minGap: 0.2,
            packOrderStrategy: "largest_to_smallest",
            packPlacementStrategy: "minimum_sum_squared_distance_to_network",
          },
        },
        {
          MAX_ITERATIONS: 1000,
          solved: true,
          failed: false,
          iterations: 1,
          progress: 0,
          error: null,
          stats: {},
          pinRange: {
            pinIds: ["U2.5", "U2.6", "U2.7"],
            side: "x+",
            chipId: "U2",
            connectedPins: [],
            connectedChips: [],
          },
          inputProblem: {
            chipMap: {
              U2: {
                chipId: "U2",
                pins: [
                  "U2.1",
                  "U2.2",
                  "U2.3",
                  "U2.4",
                  "U2.5",
                  "U2.6",
                  "U2.7",
                  "U2.8",
                ],
                size: {
                  x: 1.2000000000000002,
                  y: 1,
                },
              },
            },
            chipPinMap: {
              "U2.1": {
                pinId: "U2.1",
                offset: {
                  x: -1,
                  y: 0.30000000000000004,
                },
                side: "x-",
              },
              "U2.2": {
                pinId: "U2.2",
                offset: {
                  x: -1,
                  y: 0.10000000000000003,
                },
                side: "x-",
              },
              "U2.3": {
                pinId: "U2.3",
                offset: {
                  x: -1,
                  y: -0.09999999999999998,
                },
                side: "x-",
              },
              "U2.4": {
                pinId: "U2.4",
                offset: {
                  x: -1,
                  y: -0.30000000000000004,
                },
                side: "x-",
              },
              "U2.5": {
                pinId: "U2.5",
                offset: {
                  x: 1,
                  y: -0.30000000000000004,
                },
                side: "x+",
              },
              "U2.6": {
                pinId: "U2.6",
                offset: {
                  x: 1,
                  y: -0.10000000000000003,
                },
                side: "x+",
              },
              "U2.7": {
                pinId: "U2.7",
                offset: {
                  x: 1,
                  y: 0.09999999999999998,
                },
                side: "x+",
              },
              "U2.8": {
                pinId: "U2.8",
                offset: {
                  x: 1,
                  y: 0.30000000000000004,
                },
                side: "x+",
              },
            },
            groupMap: {},
            groupPinMap: {},
            netMap: {
              VCC: {
                netId: "VCC",
              },
              GND: {
                netId: "GND",
              },
            },
            pinStrongConnMap: {},
            netConnMap: {
              "U2.1-VCC": true,
              "U2.2-GND": true,
            },
          },
          layoutApplied: true,
          layout: {
            chipPlacements: {
              U2: {
                x: 0,
                y: 0,
                ccwRotationDegrees: 0,
              },
            },
            groupPlacements: {},
          },
          debugPackInput: {
            components: [
              {
                componentId: "U2",
                pads: [
                  {
                    padId: "U2.1",
                    networkId: "disconnected_0",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.2",
                    networkId: "disconnected_1",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.3",
                    networkId: "disconnected_2",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.4",
                    networkId: "disconnected_3",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.5",
                    networkId: "disconnected_4",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.6",
                    networkId: "disconnected_5",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.7",
                    networkId: "disconnected_6",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.8",
                    networkId: "disconnected_7",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2-body",
                    networkId: "disconnected_8",
                    type: "rect",
                    offset: {
                      x: 0,
                      y: 0,
                    },
                    size: {
                      x: 1.2000000000000002,
                      y: 1,
                    },
                  },
                ],
              },
            ],
            minGap: 0.2,
            packOrderStrategy: "largest_to_smallest",
            packPlacementStrategy: "minimum_sum_squared_distance_to_network",
          },
        },
        {
          MAX_ITERATIONS: 1000,
          solved: true,
          failed: false,
          iterations: 1,
          progress: 0,
          error: null,
          stats: {},
          pinRange: {
            pinIds: ["U2.8"],
            side: "x+",
            chipId: "U2",
            connectedPins: [],
            connectedChips: [],
          },
          inputProblem: {
            chipMap: {
              U2: {
                chipId: "U2",
                pins: [
                  "U2.1",
                  "U2.2",
                  "U2.3",
                  "U2.4",
                  "U2.5",
                  "U2.6",
                  "U2.7",
                  "U2.8",
                ],
                size: {
                  x: 1.2000000000000002,
                  y: 1,
                },
              },
            },
            chipPinMap: {
              "U2.1": {
                pinId: "U2.1",
                offset: {
                  x: -1,
                  y: 0.30000000000000004,
                },
                side: "x-",
              },
              "U2.2": {
                pinId: "U2.2",
                offset: {
                  x: -1,
                  y: 0.10000000000000003,
                },
                side: "x-",
              },
              "U2.3": {
                pinId: "U2.3",
                offset: {
                  x: -1,
                  y: -0.09999999999999998,
                },
                side: "x-",
              },
              "U2.4": {
                pinId: "U2.4",
                offset: {
                  x: -1,
                  y: -0.30000000000000004,
                },
                side: "x-",
              },
              "U2.5": {
                pinId: "U2.5",
                offset: {
                  x: 1,
                  y: -0.30000000000000004,
                },
                side: "x+",
              },
              "U2.6": {
                pinId: "U2.6",
                offset: {
                  x: 1,
                  y: -0.10000000000000003,
                },
                side: "x+",
              },
              "U2.7": {
                pinId: "U2.7",
                offset: {
                  x: 1,
                  y: 0.09999999999999998,
                },
                side: "x+",
              },
              "U2.8": {
                pinId: "U2.8",
                offset: {
                  x: 1,
                  y: 0.30000000000000004,
                },
                side: "x+",
              },
            },
            groupMap: {},
            groupPinMap: {},
            netMap: {
              VCC: {
                netId: "VCC",
              },
              GND: {
                netId: "GND",
              },
            },
            pinStrongConnMap: {},
            netConnMap: {
              "U2.1-VCC": true,
              "U2.2-GND": true,
            },
          },
          layoutApplied: true,
          layout: {
            chipPlacements: {
              U2: {
                x: 0,
                y: 0,
                ccwRotationDegrees: 0,
              },
            },
            groupPlacements: {},
          },
          debugPackInput: {
            components: [
              {
                componentId: "U2",
                pads: [
                  {
                    padId: "U2.1",
                    networkId: "disconnected_0",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.2",
                    networkId: "disconnected_1",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: 0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.3",
                    networkId: "disconnected_2",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.4",
                    networkId: "disconnected_3",
                    type: "rect",
                    offset: {
                      x: -1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.5",
                    networkId: "disconnected_4",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.6",
                    networkId: "disconnected_5",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: -0.10000000000000003,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.7",
                    networkId: "disconnected_6",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.09999999999999998,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2.8",
                    networkId: "disconnected_7",
                    type: "rect",
                    offset: {
                      x: 1,
                      y: 0.30000000000000004,
                    },
                    size: {
                      x: 0.05,
                      y: 0.05,
                    },
                  },
                  {
                    padId: "U2-body",
                    networkId: "disconnected_8",
                    type: "rect",
                    offset: {
                      x: 0,
                      y: 0,
                    },
                    size: {
                      x: 1.2000000000000002,
                      y: 1,
                    },
                  },
                ],
              },
            ],
            minGap: 0.2,
            packOrderStrategy: "largest_to_smallest",
            packPlacementStrategy: "minimum_sum_squared_distance_to_network",
          },
        },
      ],
    },
    inputProblems: [
      {
        chipMap: {
          C6: {
            chipId: "C6",
            pins: ["C6.1", "C6.2"],
            size: {
              x: 0.5291665999999999,
              y: 1.0583333000000001,
            },
          },
          U1: {
            chipId: "U1",
            pins: [
              "U1.1",
              "U1.2",
              "U1.3",
              "U1.4",
              "U1.5",
              "U1.6",
              "U1.7",
              "U1.8",
            ],
            size: {
              x: 1.2000000000000002,
              y: 1,
            },
          },
          C5: {
            chipId: "C5",
            pins: ["C5.1", "C5.2"],
            size: {
              x: 0.5291665999999999,
              y: 1.0583333000000001,
            },
          },
          C2: {
            chipId: "C2",
            pins: ["C2.1", "C2.2"],
            size: {
              x: 0.5291665999999999,
              y: 1.0583333000000001,
            },
          },
          C1: {
            chipId: "C1",
            pins: ["C1.1", "C1.2"],
            size: {
              x: 0.5291665999999999,
              y: 1.0583333000000001,
            },
          },
        },
        chipPinMap: {
          "C6.1": {
            pinId: "C6.1",
            offset: {
              x: -0.00027334999999961695,
              y: 0.5512093000000002,
            },
            side: "y+",
          },
          "C6.2": {
            pinId: "C6.2",
            offset: {
              x: 0.00027334999999961695,
              y: -0.5512093000000002,
            },
            side: "y-",
          },
          "U1.1": {
            pinId: "U1.1",
            offset: {
              x: -1,
              y: 0.30000000000000004,
            },
            side: "x-",
          },
          "U1.2": {
            pinId: "U1.2",
            offset: {
              x: -1,
              y: 0.10000000000000003,
            },
            side: "x-",
          },
          "U1.3": {
            pinId: "U1.3",
            offset: {
              x: -1,
              y: -0.09999999999999998,
            },
            side: "x-",
          },
          "U1.4": {
            pinId: "U1.4",
            offset: {
              x: -1,
              y: -0.30000000000000004,
            },
            side: "x-",
          },
          "U1.5": {
            pinId: "U1.5",
            offset: {
              x: 1,
              y: -0.30000000000000004,
            },
            side: "x+",
          },
          "U1.6": {
            pinId: "U1.6",
            offset: {
              x: 1,
              y: -0.10000000000000003,
            },
            side: "x+",
          },
          "U1.7": {
            pinId: "U1.7",
            offset: {
              x: 1,
              y: 0.09999999999999998,
            },
            side: "x+",
          },
          "U1.8": {
            pinId: "U1.8",
            offset: {
              x: 1,
              y: 0.30000000000000004,
            },
            side: "x+",
          },
          "C5.1": {
            pinId: "C5.1",
            offset: {
              x: -0.000273349999999839,
              y: 0.5512093000000002,
            },
            side: "y+",
          },
          "C5.2": {
            pinId: "C5.2",
            offset: {
              x: 0.00027334999999961695,
              y: -0.5512093000000002,
            },
            side: "y-",
          },
          "C2.1": {
            pinId: "C2.1",
            offset: {
              x: -0.00027334999999961695,
              y: 0.5512093000000002,
            },
            side: "y+",
          },
          "C2.2": {
            pinId: "C2.2",
            offset: {
              x: 0.00027335000000006104,
              y: -0.5512093000000002,
            },
            side: "y-",
          },
          "C1.1": {
            pinId: "C1.1",
            offset: {
              x: -0.00027335000000006104,
              y: 0.5512093000000002,
            },
            side: "y+",
          },
          "C1.2": {
            pinId: "C1.2",
            offset: {
              x: 0.00027334999999961695,
              y: -0.5512093000000002,
            },
            side: "y-",
          },
        },
        groupMap: {},
        groupPinMap: {},
        netMap: {
          VSYS: {
            netId: "VSYS",
          },
          GND: {
            netId: "GND",
          },
          V3_3: {
            netId: "V3_3",
          },
        },
        pinStrongConnMap: {
          "U1.1-C6.1": true,
          "C6.1-U1.1": true,
          "U1.1-C1.1": true,
          "C1.1-U1.1": true,
          "U1.1-C2.1": true,
          "C2.1-U1.1": true,
          "U1.2-C6.2": true,
          "C6.2-U1.2": true,
          "U1.2-C1.2": true,
          "C1.2-U1.2": true,
          "U1.2-C2.2": true,
          "C2.2-U1.2": true,
          "U1.3-U1.1": true,
          "U1.1-U1.3": true,
          "U1.4-C5.1": true,
          "C5.1-U1.4": true,
        },
        netConnMap: {
          "U1.1-VSYS": true,
          "U1.2-GND": true,
          "U1.4-V3_3": true,
          "C5.2-GND": true,
        },
      },
      {
        chipMap: {
          U2: {
            chipId: "U2",
            pins: [
              "U2.1",
              "U2.2",
              "U2.3",
              "U2.4",
              "U2.5",
              "U2.6",
              "U2.7",
              "U2.8",
            ],
            size: {
              x: 1.2000000000000002,
              y: 1,
            },
          },
        },
        chipPinMap: {
          "U2.1": {
            pinId: "U2.1",
            offset: {
              x: -1,
              y: 0.30000000000000004,
            },
            side: "x-",
          },
          "U2.2": {
            pinId: "U2.2",
            offset: {
              x: -1,
              y: 0.10000000000000003,
            },
            side: "x-",
          },
          "U2.3": {
            pinId: "U2.3",
            offset: {
              x: -1,
              y: -0.09999999999999998,
            },
            side: "x-",
          },
          "U2.4": {
            pinId: "U2.4",
            offset: {
              x: -1,
              y: -0.30000000000000004,
            },
            side: "x-",
          },
          "U2.5": {
            pinId: "U2.5",
            offset: {
              x: 1,
              y: -0.30000000000000004,
            },
            side: "x+",
          },
          "U2.6": {
            pinId: "U2.6",
            offset: {
              x: 1,
              y: -0.10000000000000003,
            },
            side: "x+",
          },
          "U2.7": {
            pinId: "U2.7",
            offset: {
              x: 1,
              y: 0.09999999999999998,
            },
            side: "x+",
          },
          "U2.8": {
            pinId: "U2.8",
            offset: {
              x: 1,
              y: 0.30000000000000004,
            },
            side: "x+",
          },
        },
        groupMap: {},
        groupPinMap: {},
        netMap: {
          VCC: {
            netId: "VCC",
          },
          GND: {
            netId: "GND",
          },
        },
        pinStrongConnMap: {},
        netConnMap: {
          "U2.1-VCC": true,
          "U2.2-GND": true,
        },
      },
    ],
    resolvedLayout: {
      chipPlacements: {
        U1: {
          x: 2.6167286449535703,
          y: 0,
          ccwRotationDegrees: 0,
        },
        C5: {
          x: 0.8628353449535702,
          y: -1.004771698352237,
          ccwRotationDegrees: 0,
        },
        C6: {
          x: 0.8625619949535703,
          y: 0.2535616016477631,
          ccwRotationDegrees: 180,
        },
        C1: {
          x: 1.30510264495357,
          y: 1.2288933605067471,
          ccwRotationDegrees: 270,
        },
        C2: {
          x: 0,
          y: 0.8541662613152188,
          ccwRotationDegrees: 180,
        },
        U2: {
          x: 7.61672864495357,
          y: 0,
          ccwRotationDegrees: 0,
        },
      },
      groupPlacements: {},
    },
  },
  [
    {
      chipMap: {
        C6: {
          chipId: "C6",
          pins: ["C6.1", "C6.2"],
          size: {
            x: 0.5291665999999999,
            y: 1.0583333000000001,
          },
        },
        U1: {
          chipId: "U1",
          pins: [
            "U1.1",
            "U1.2",
            "U1.3",
            "U1.4",
            "U1.5",
            "U1.6",
            "U1.7",
            "U1.8",
          ],
          size: {
            x: 1.2000000000000002,
            y: 1,
          },
        },
        C5: {
          chipId: "C5",
          pins: ["C5.1", "C5.2"],
          size: {
            x: 0.5291665999999999,
            y: 1.0583333000000001,
          },
        },
        C2: {
          chipId: "C2",
          pins: ["C2.1", "C2.2"],
          size: {
            x: 0.5291665999999999,
            y: 1.0583333000000001,
          },
        },
        C1: {
          chipId: "C1",
          pins: ["C1.1", "C1.2"],
          size: {
            x: 0.5291665999999999,
            y: 1.0583333000000001,
          },
        },
      },
      chipPinMap: {
        "C6.1": {
          pinId: "C6.1",
          offset: {
            x: -0.00027334999999961695,
            y: 0.5512093000000002,
          },
          side: "y+",
        },
        "C6.2": {
          pinId: "C6.2",
          offset: {
            x: 0.00027334999999961695,
            y: -0.5512093000000002,
          },
          side: "y-",
        },
        "U1.1": {
          pinId: "U1.1",
          offset: {
            x: -1,
            y: 0.30000000000000004,
          },
          side: "x-",
        },
        "U1.2": {
          pinId: "U1.2",
          offset: {
            x: -1,
            y: 0.10000000000000003,
          },
          side: "x-",
        },
        "U1.3": {
          pinId: "U1.3",
          offset: {
            x: -1,
            y: -0.09999999999999998,
          },
          side: "x-",
        },
        "U1.4": {
          pinId: "U1.4",
          offset: {
            x: -1,
            y: -0.30000000000000004,
          },
          side: "x-",
        },
        "U1.5": {
          pinId: "U1.5",
          offset: {
            x: 1,
            y: -0.30000000000000004,
          },
          side: "x+",
        },
        "U1.6": {
          pinId: "U1.6",
          offset: {
            x: 1,
            y: -0.10000000000000003,
          },
          side: "x+",
        },
        "U1.7": {
          pinId: "U1.7",
          offset: {
            x: 1,
            y: 0.09999999999999998,
          },
          side: "x+",
        },
        "U1.8": {
          pinId: "U1.8",
          offset: {
            x: 1,
            y: 0.30000000000000004,
          },
          side: "x+",
        },
        "C5.1": {
          pinId: "C5.1",
          offset: {
            x: -0.000273349999999839,
            y: 0.5512093000000002,
          },
          side: "y+",
        },
        "C5.2": {
          pinId: "C5.2",
          offset: {
            x: 0.00027334999999961695,
            y: -0.5512093000000002,
          },
          side: "y-",
        },
        "C2.1": {
          pinId: "C2.1",
          offset: {
            x: -0.00027334999999961695,
            y: 0.5512093000000002,
          },
          side: "y+",
        },
        "C2.2": {
          pinId: "C2.2",
          offset: {
            x: 0.00027335000000006104,
            y: -0.5512093000000002,
          },
          side: "y-",
        },
        "C1.1": {
          pinId: "C1.1",
          offset: {
            x: -0.00027335000000006104,
            y: 0.5512093000000002,
          },
          side: "y+",
        },
        "C1.2": {
          pinId: "C1.2",
          offset: {
            x: 0.00027334999999961695,
            y: -0.5512093000000002,
          },
          side: "y-",
        },
      },
      groupMap: {},
      groupPinMap: {},
      netMap: {
        VSYS: {
          netId: "VSYS",
        },
        GND: {
          netId: "GND",
        },
        V3_3: {
          netId: "V3_3",
        },
      },
      pinStrongConnMap: {
        "U1.1-C6.1": true,
        "C6.1-U1.1": true,
        "U1.1-C1.1": true,
        "C1.1-U1.1": true,
        "U1.1-C2.1": true,
        "C2.1-U1.1": true,
        "U1.2-C6.2": true,
        "C6.2-U1.2": true,
        "U1.2-C1.2": true,
        "C1.2-U1.2": true,
        "U1.2-C2.2": true,
        "C2.2-U1.2": true,
        "U1.3-U1.1": true,
        "U1.1-U1.3": true,
        "U1.4-C5.1": true,
        "C5.1-U1.4": true,
      },
      netConnMap: {
        "U1.1-VSYS": true,
        "U1.2-GND": true,
        "U1.4-V3_3": true,
        "C5.2-GND": true,
      },
    },
    {
      chipMap: {
        U2: {
          chipId: "U2",
          pins: [
            "U2.1",
            "U2.2",
            "U2.3",
            "U2.4",
            "U2.5",
            "U2.6",
            "U2.7",
            "U2.8",
          ],
          size: {
            x: 1.2000000000000002,
            y: 1,
          },
        },
      },
      chipPinMap: {
        "U2.1": {
          pinId: "U2.1",
          offset: {
            x: -1,
            y: 0.30000000000000004,
          },
          side: "x-",
        },
        "U2.2": {
          pinId: "U2.2",
          offset: {
            x: -1,
            y: 0.10000000000000003,
          },
          side: "x-",
        },
        "U2.3": {
          pinId: "U2.3",
          offset: {
            x: -1,
            y: -0.09999999999999998,
          },
          side: "x-",
        },
        "U2.4": {
          pinId: "U2.4",
          offset: {
            x: -1,
            y: -0.30000000000000004,
          },
          side: "x-",
        },
        "U2.5": {
          pinId: "U2.5",
          offset: {
            x: 1,
            y: -0.30000000000000004,
          },
          side: "x+",
        },
        "U2.6": {
          pinId: "U2.6",
          offset: {
            x: 1,
            y: -0.10000000000000003,
          },
          side: "x+",
        },
        "U2.7": {
          pinId: "U2.7",
          offset: {
            x: 1,
            y: 0.09999999999999998,
          },
          side: "x+",
        },
        "U2.8": {
          pinId: "U2.8",
          offset: {
            x: 1,
            y: 0.30000000000000004,
          },
          side: "x+",
        },
      },
      groupMap: {},
      groupPinMap: {},
      netMap: {
        VCC: {
          netId: "VCC",
        },
        GND: {
          netId: "GND",
        },
      },
      pinStrongConnMap: {},
      netConnMap: {
        "U2.1-VCC": true,
        "U2.2-GND": true,
      },
    },
  ],
]

export default () => {
  const solver = useMemo(() => {
    // Use the first input from the partitionPackingSolverInputs data
    const inputData = partitionPackingSolverInputs[0]!
    
    // Create a mock PinRangeOverlapSolver with the resolved layout
    const pinRangeOverlapSolver = new PinRangeOverlapSolver(
      inputData.pinRangeLayoutSolver as any,
      inputData.pinRangeLayoutSolver.inputProblems
    )
    
    // Set the solver state to solved with the resolved layout
    pinRangeOverlapSolver.solved = true
    pinRangeOverlapSolver.resolvedLayout = {
      chipPlacements: inputData.resolvedLayout.chipPlacements,
      groupPlacements: inputData.resolvedLayout.groupPlacements
    }

    // Create PartitionPackingSolver with the mock overlap solver and input problems
    const partitionSolver = new PartitionPackingSolver(
      pinRangeOverlapSolver,
      inputData.pinRangeLayoutSolver.inputProblems
    )

    return partitionSolver
  }, [])

  return <GenericSolverDebugger solver={solver} />
}
