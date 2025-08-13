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
    return s
  }, [problem])

  // Initialize visualization history when solver changes
  useMemo(() => {
    setVisualizationHistory([{ iteration: 0, graphics: solver.visualize() }])
    setSelectedIteration(null)
  }, [solver])

  return (
    <div>
      <LayoutPipelineToolbar
        currentTab={currentTab}
        onChangeTab={(tab) => setCurrentTab(tab)}
        onStep={() => {
          solver.step()
          const graphics = solver.visualize()
          console.log(
            `Capturing step visualization for iteration ${solver.iterations}`,
          )
          setVisualizationHistory((prev) => [
            ...prev,
            { iteration: solver.iterations, graphics },
          ])
          incRunCount()
        }}
        onSolve={() => {
          // Collect all intermediate visualizations during solve
          const newVisualizations: Array<{ iteration: number; graphics: any }> =
            []

          while (!solver.solved && !solver.failed) {
            solver.step()
            const graphics = solver.visualize()
            console.log(
              `Capturing solve visualization for iteration ${solver.iterations}`,
            )
            newVisualizations.push({ iteration: solver.iterations, graphics })
          }

          // Update visualization history with all new visualizations
          setVisualizationHistory((prev) => {
            const updatedHistory = [...prev]
            for (const newViz of newVisualizations) {
              const existingIndex = updatedHistory.findIndex(
                (viz) => viz.iteration === newViz.iteration,
              )
              if (existingIndex >= 0) {
                updatedHistory[existingIndex] = newViz
              } else {
                updatedHistory.push(newViz)
              }
            }
            return updatedHistory.sort((a, b) => a.iteration - b.iteration)
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
              {(() => {
                const currentIndex = visualizationHistory.findIndex(
                  (viz) => viz.iteration === selectedIteration,
                )
                const hasNext =
                  currentIndex >= 0 &&
                  currentIndex < visualizationHistory.length - 1
                return (
                  hasNext && (
                    <>
                      <span style={{ margin: "0 5px" }}>|</span>
                      <span
                        onClick={() => {
                          const nextIteration =
                            visualizationHistory[currentIndex + 1].iteration
                          setSelectedIteration(nextIteration)
                        }}
                        style={{
                          color: "#007bff",
                          cursor: "pointer",
                          textDecoration: "underline",
                        }}
                      >
                        next
                      </span>
                    </>
                  )
                )
              })()}
              <strong>)</strong>
            </div>
          )}

          <InteractiveGraphics
            key={`${runCount}-${selectedIteration ?? "latest"}`}
            graphics={(() => {
              if (selectedIteration !== null) {
                const found = visualizationHistory.find(
                  (viz) => viz.iteration === selectedIteration,
                )
                console.log(
                  `Looking for iteration ${selectedIteration}, found:`,
                  !!found,
                )
                return found?.graphics || solver.visualize()
              }
              console.log("Using latest visualization")
              return solver.visualize()
            })()}
          />
          <PipelineStatusTable
            solver={solver}
            runCount={runCount}
            visualizationHistory={visualizationHistory}
            selectedIteration={selectedIteration}
            onSelectIteration={(iteration) => {
              console.log("Selecting iteration:", iteration)
              console.log(
                "Available visualizations:",
                visualizationHistory.map((v) => v.iteration),
              )
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
