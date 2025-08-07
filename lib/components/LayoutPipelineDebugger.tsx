import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { useMemo, useReducer, useState } from "react"
import { InteractiveGraphics } from "graphics-debug/react"
import { LayoutPipelineToolbar } from "./LayoutPipelineToolbar"
import type { CircuitJson } from "circuit-json"
import { SchematicViewer } from "@tscircuit/schematic-viewer"

export const LayoutPipelineDebugger = ({
  problem,
  problemCircuitJson,
}: {
  problem: InputProblem
  problemCircuitJson?: CircuitJson
}) => {
  const [runCount, incRunCount] = useReducer((x) => x + 1, 0)
  const [currentTab, setCurrentTab] = useState<"pipeline" | "circuit">(
    "pipeline",
  )
  const solver = useMemo(() => new LayoutPipelineSolver(problem), [])

  return (
    <div>
      <LayoutPipelineToolbar
        currentTab={currentTab}
        onChangeTab={(tab) => setCurrentTab(tab)}
        onStep={() => {
          solver.step()
          incRunCount()
        }}
        onSolve={() => {
          solver.solve()
          incRunCount()
        }}
      />
      {currentTab === "pipeline" && (
        <InteractiveGraphics graphics={solver.visualize()} />
      )}
      {currentTab === "circuit" &&
        (problemCircuitJson ? (
          <SchematicViewer
            containerStyle={{ height: "calc(100vh - 80px)" }}
            circuitJson={problemCircuitJson}
          />
        ) : (
          "No circuit json passed to debugger"
        ))}
    </div>
  )
}
