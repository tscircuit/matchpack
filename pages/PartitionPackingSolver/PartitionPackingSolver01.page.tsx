import { useMemo } from "react"
import { GenericSolverDebugger } from "lib/components/GenericSolverDebugger"
import {
  PartitionPackingSolver,
  type PartitionPackingSolverInput,
} from "lib/solvers/PartitionPackingSolver/PartitionPackingSolver"
import type { InputProblem } from "lib/types/InputProblem"

// Static input data - generated from running the solver chain (see corresponding test)
const STATIC_INPUT: PartitionPackingSolverInput = {
  inputProblem: {
    chipMap: {},
    chipPinMap: {},
    netMap: {},
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.2,
    partitionGap: 2,
  },
  // @ts-ignore
  resolvedLayout: {
    chipPlacements: {
      Q1: { x: 1.1761957854999991, y: 0, ccwRotationDegrees: 0 },
      R7: { x: 0, y: -0.6537968869978352, ccwRotationDegrees: 0 },
      U1: { x: 6.176195785499999, y: 0, ccwRotationDegrees: 0 },
      C1: { x: 11.1761957855, y: 0, ccwRotationDegrees: 0 },
      I2C: { x: 17.376436485499998, y: 0, ccwRotationDegrees: 0 },
      R5: {
        x: 18.576130685499997,
        y: -0.6528779266786373,
        ccwRotationDegrees: 0,
      },
      R2: { x: 16.1761957855, y: -0.6527534657165477, ccwRotationDegrees: 0 },
      J3: { x: 23.5761306855, y: 0, ccwRotationDegrees: 0 },
      J1: { x: 28.5761306855, y: 0, ccwRotationDegrees: 0 },
      J2: { x: 33.576130685500004, y: 0, ccwRotationDegrees: 0 },
      R3: { x: 39.902802723000015, y: 0, ccwRotationDegrees: 0 },
      D1: { x: 38.576130685500004, y: 0, ccwRotationDegrees: 0 },
      LED: { x: 39.31979813550001, y: 0, ccwRotationDegrees: 0 },
      INT_JP: { x: 45.46090344800001, y: 0, ccwRotationDegrees: 0 },
      R4: { x: 44.90280272300001, y: 0, ccwRotationDegrees: 0 },
    },
    groupPlacements: {},
  },
  laidOutPartitions: [
    // Partition 0: R7, Q1
    {
      chipMap: {
        R7: {
          chipId: "R7",
          pins: ["R7.1", "R7.2"],
          size: { x: 0.40790845000000175, y: 1.0583332999999997 },
        },
        Q1: {
          chipId: "Q1",
          pins: ["Q1.1", "Q1.2", "Q1.3"],
          size: { x: 0.8935117710000002, y: 1.1601665819999987 },
        },
      },
      chipPinMap: {
        "R7.1": {
          pinId: "R7.1",
          offset: { x: -0.0002732499999993365, y: -0.5512907000000005 },
          side: "y-",
        },
        "R7.2": {
          pinId: "R7.2",
          offset: { x: 0.0002732499999993365, y: 0.5512907000000002 },
          side: "y+",
        },
        "Q1.1": {
          pinId: "Q1.1",
          offset: { x: 0.30397715550000004, y: 0.5519248499999994 },
          side: "y+",
        },
        "Q1.2": {
          pinId: "Q1.2",
          offset: { x: 0.31067575550000137, y: -0.5519248499999994 },
          side: "y-",
        },
        "Q1.3": {
          pinId: "Q1.3",
          offset: { x: -0.4185974445, y: -0.10250625000000019 },
          side: "x-",
        },
      },
      netMap: {
        GND: { netId: "GND" },
        V3_3: { netId: "V3_3" },
        V3_3_SW: { netId: "V3_3_SW" },
        DISABLE: { netId: "DISABLE" },
      },
      pinStrongConnMap: { "R7.2-Q1.3": true, "Q1.3-R7.2": true },
      netConnMap: {
        "R7.1-GND": true,
        "Q1.1-V3_3": true,
        "Q1.2-V3_3_SW": true,
        "Q1.3-DISABLE": true,
      },
      chipGap: 0.2,
      partitionGap: 2,
    },
    // Additional partitions would go here but truncated for brevity
  ] as InputProblem[],
}

export default function PartitionPackingSolver01Page() {
  const solver = useMemo(() => {
    return new PartitionPackingSolver(STATIC_INPUT)
  }, [])

  return <GenericSolverDebugger solver={solver} />
}
