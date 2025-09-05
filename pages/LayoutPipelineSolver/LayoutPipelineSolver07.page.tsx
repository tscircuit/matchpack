import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import type { InputProblem } from "lib/index"

export const problem: InputProblem = {
  chipMap: {
    U3: {
      chipId: "U3",
      pins: ["U3.8", "U3.4", "U3.1", "U3.6", "U3.5", "U3.2", "U3.3", "U3.7"],
      size: {
        x: 2,
        y: 1.4,
      },
      availableRotations: [0, 90, 180, 270],
    },
    C20: {
      chipId: "C20",
      pins: ["C20.1", "C20.2"],
      size: {
        x: 0.53,
        y: 1.06,
      },
      availableRotations: [0],
    },
    R11: {
      chipId: "R11",
      pins: ["R11.1", "R11.2"],
      size: {
        x: 0.3194553499999995,
        y: 1.06,
      },
      availableRotations: [0],
    },
  },
  chipPinMap: {
    "U3.8": {
      pinId: "U3.8",
      offset: {
        x: -1.4,
        y: 0.42500000000000004,
      },
      side: "x-",
    },
    "U3.4": {
      pinId: "U3.4",
      offset: {
        x: -1.4,
        y: -0.42500000000000004,
      },
      side: "x-",
    },
    "U3.1": {
      pinId: "U3.1",
      offset: {
        x: 1.4,
        y: 0.5,
      },
      side: "x+",
    },
    "U3.6": {
      pinId: "U3.6",
      offset: {
        x: 1.4,
        y: 0.30000000000000004,
      },
      side: "x+",
    },
    "U3.5": {
      pinId: "U3.5",
      offset: {
        x: 1.4,
        y: 0.10000000000000009,
      },
      side: "x+",
    },
    "U3.2": {
      pinId: "U3.2",
      offset: {
        x: 1.4,
        y: -0.09999999999999998,
      },
      side: "x+",
    },
    "U3.3": {
      pinId: "U3.3",
      offset: {
        x: 1.4,
        y: -0.3,
      },
      side: "x+",
    },
    "U3.7": {
      pinId: "U3.7",
      offset: {
        x: 1.4,
        y: -0.5,
      },
      side: "x+",
    },
    "C20.1": {
      pinId: "C20.1",
      offset: {
        x: -3.469446951953614e-17,
        y: 0.55,
      },
      side: "y+",
    },
    "C20.2": {
      pinId: "C20.2",
      offset: {
        x: 3.469446951953614e-17,
        y: -0.55,
      },
      side: "y-",
    },
    "R11.1": {
      pinId: "R11.1",
      offset: {
        x: -3.469446951953614e-17,
        y: 0.5499999999999999,
      },
      side: "y+",
    },
    "R11.2": {
      pinId: "R11.2",
      offset: {
        x: 3.469446951953614e-17,
        y: -0.55,
      },
      side: "y-",
    },
  },
  netMap: {
    unnamedsubcircuit33_connectivity_net0: {
      netId: "unnamedsubcircuit33_connectivity_net0",
    },
    unnamedsubcircuit33_connectivity_net1: {
      netId: "unnamedsubcircuit33_connectivity_net1",
    },
    unnamedsubcircuit33_connectivity_net5: {
      netId: "unnamedsubcircuit33_connectivity_net5",
    },
  },
  pinStrongConnMap: {
    "C20.1-U3.8": true,
    "U3.8-C20.1": true,
    "C20.2-U3.4": true,
    "U3.4-C20.2": true,
    "R11.2-U3.1": true,
    "U3.1-R11.2": true,
  },
  netConnMap: {
    "U3.8-unnamedsubcircuit33_connectivity_net0": true,
    "U3.3-unnamedsubcircuit33_connectivity_net0": true,
    "U3.7-unnamedsubcircuit33_connectivity_net0": true,
    "C20.1-unnamedsubcircuit33_connectivity_net0": true,
    "R11.1-unnamedsubcircuit33_connectivity_net0": true,
    "U3.4-unnamedsubcircuit33_connectivity_net1": true,
    "C20.2-unnamedsubcircuit33_connectivity_net1": true,
    "U3.1-unnamedsubcircuit33_connectivity_net5": true,
    "R11.2-unnamedsubcircuit33_connectivity_net5": true,
  },
  chipGap: 0.6,
  decouplingCapsGap: 0.4,
  partitionGap: 1.2,
}

export default function LayoutPipelineSolver07Page() {
  return <LayoutPipelineDebugger problem={problem} />
}
