import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { InputProblem } from "lib/types/InputProblem"
import { useMemo, useReducer, useState, useRef, useCallback } from "react"
import { InteractiveGraphics } from "graphics-debug/react"
import { LayoutPipelineToolbar } from "./LayoutPipelineToolbar"
import { PipelineStatusTable } from "./PipelineStatusTable"
import type { CircuitJson } from "circuit-json"
import { SchematicViewer } from "@tscircuit/schematic-viewer"
import type { BaseSolver } from "lib/solvers/BaseSolver"

const getSolverHierarchy = (solver: BaseSolver): BaseSolver[] => {
  const hierarchy = [solver]
  let current = solver
  while (current.activeSubSolver) {
    current = current.activeSubSolver
    hierarchy.push(current)
  }
  return hierarchy
}

const downloadConstructorParams = (solver: BaseSolver) => {
  try {
    const params = solver.getConstructorParams()
    const dataStr = JSON.stringify(params, null, 2)
    const dataBlob = new Blob([dataStr], { type: "application/json" })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${solver.constructor.name}_params.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error("Failed to download constructor params:", error)
    alert(`Failed to download parameters: ${error}`)
  }
}

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
  const [isAnimating, setIsAnimating] = useState(false)
  const animationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const solver = useMemo(() => {
    const s = new LayoutPipelineSolver(problem)
    return s
  }, [problem])

  // Initialize visualization history when solver changes
  useMemo(() => {
    setVisualizationHistory([{ iteration: 0, graphics: solver.visualize() }])
    setSelectedIteration(null)
    // Stop animation if solver changes
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current)
      animationIntervalRef.current = null
      setIsAnimating(false)
    }
  }, [solver])

  const startAnimation = useCallback(() => {
    if (animationIntervalRef.current || solver.solved || solver.failed) return

    setIsAnimating(true)
    animationIntervalRef.current = setInterval(() => {
      if (solver.solved || solver.failed) {
        clearInterval(animationIntervalRef.current!)
        animationIntervalRef.current = null
        setIsAnimating(false)
        return
      }

      solver.step()
      const graphics = solver.visualize()
      setVisualizationHistory((prev) => [
        ...prev,
        { iteration: solver.iterations, graphics },
      ])
      incRunCount()
    }, 25) // 40 iterations/second = 25ms interval
  }, [solver])

  const stopAnimation = useCallback(() => {
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current)
      animationIntervalRef.current = null
      setIsAnimating(false)
    }
  }, [])

  // Cleanup animation on unmount
  useMemo(() => {
    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current)
      }
    }
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
          // Stop animation if running
          stopAnimation()

          // Collect all intermediate visualizations during solve
          const newVisualizations: Array<{ iteration: number; graphics: any }> =
            []

          while (!solver.solved && !solver.failed) {
            solver.step()
            const graphics = solver.visualize()
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
        onAnimate={startAnimation}
        onStopAnimate={stopAnimation}
        isAnimating={isAnimating}
        solverHierarchy={getSolverHierarchy(solver)}
        onDownloadConstructorParams={downloadConstructorParams}
        iterationCount={solver.iterations}
        status={solver.solved ? "solved" : solver.failed ? "failed" : "running"}
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
                const hasPrev = currentIndex > 0
                const hasNext =
                  currentIndex >= 0 &&
                  currentIndex < visualizationHistory.length - 1
                return (
                  <>
                    {hasPrev && (
                      <>
                        <span style={{ margin: "0 5px" }}>|</span>
                        <span
                          onClick={() => {
                            const prevIteration =
                              visualizationHistory[currentIndex - 1]!.iteration
                            setSelectedIteration(prevIteration)
                          }}
                          style={{
                            color: "#007bff",
                            cursor: "pointer",
                            textDecoration: "underline",
                          }}
                        >
                          prev
                        </span>
                      </>
                    )}
                    {hasNext && (
                      <>
                        <span style={{ margin: "0 5px" }}>|</span>
                        <span
                          onClick={() => {
                            const nextIteration =
                              visualizationHistory[currentIndex + 1]!.iteration
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
                    )}
                  </>
                )
              })()}
              <strong>)</strong>
            </div>
          )}

          <InteractiveGraphics
            graphics={(() => {
              if (selectedIteration !== null) {
                const found = visualizationHistory.find(
                  (viz) => viz.iteration === selectedIteration,
                )
                return found?.graphics || solver.visualize()
              }
              return solver.visualize()
            })()}
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
