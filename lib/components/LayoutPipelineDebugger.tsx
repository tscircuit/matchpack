import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { useMemo, useReducer, useState } from "react"
import { InteractiveGraphics } from "graphics-debug/react"
import { LayoutPipelineToolbar } from "./LayoutPipelineToolbar"
import { PipelineStatusTable } from "./PipelineStatusTable"
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
  const [visualizationHistory, setVisualizationHistory] = useState<
    Array<{ iteration: number; graphics: any }>
  >([])
  const [selectedIteration, setSelectedIteration] = useState<number | null>(
    null,
  )
  const solver = useMemo(() => {
    const s = new LayoutPipelineSolver(problem)
    // Capture initial state
    setVisualizationHistory([{ iteration: 0, graphics: s.visualize() }])
    return s
  }, [])

  return (
    <div>
      <LayoutPipelineToolbar
        currentTab={currentTab}
        onChangeTab={(tab) => setCurrentTab(tab)}
        onStep={() => {
          solver.step()
          const graphics = solver.visualize()
          setVisualizationHistory((prev) => [
            ...prev,
            { iteration: solver.iterations, graphics },
          ])
          incRunCount()
        }}
        onSolve={() => {
          solver.solve()
          // After solve completes, capture the final state
          const graphics = solver.visualize()
          setVisualizationHistory((prev) => {
            // Check if this iteration already exists
            const existingIndex = prev.findIndex(
              (viz) => viz.iteration === solver.iterations,
            )
            if (existingIndex >= 0) {
              // Update existing
              const updated = [...prev]
              updated[existingIndex] = {
                iteration: solver.iterations,
                graphics,
              }
              return updated
            } else {
              // Add new
              return [...prev, { iteration: solver.iterations, graphics }]
            }
          })
          incRunCount()
        }}
        activeSubSolverName={solver.activeSubSolver?.constructor.name}
        iterationCount={solver.iterations}
      />
      {currentTab === "pipeline" && (
        <>
          {/* Viewing indicator */}
          {selectedIteration !== null && visualizationHistory.length > 0 && (
            <div
              style={{
                padding: "10px",
                backgroundColor: "#f0f0f0",
                marginBottom: "10px",
              }}
            >
              <strong>Viewing i_{selectedIteration} (</strong>
              <span
                onClick={() => setSelectedIteration(null)}
                style={{
                  color: "#007bff",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                show latest
              </span>
              <strong>)</strong>
            </div>
          )}

          <InteractiveGraphics
            key={runCount}
            graphics={
              selectedIteration !== null
                ? visualizationHistory.find(
                    (viz) => viz.iteration === selectedIteration,
                  )?.graphics || solver.visualize()
                : solver.visualize()
            }
          />
          <PipelineStatusTable
            solver={solver}
            runCount={runCount}
            visualizationHistory={visualizationHistory}
            selectedIteration={selectedIteration}
            onSelectIteration={(iteration) => {
              setSelectedIteration(iteration)
              incRunCount()
            }}
          />
        </>
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
