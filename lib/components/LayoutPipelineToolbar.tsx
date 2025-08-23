import type { BaseSolver } from "lib/solvers/BaseSolver"

export const LayoutPipelineToolbar = (props: {
  currentTab: "pipeline" | "circuit"
  status: "running" | "solved" | "failed"
  onStep: () => void
  onSolve: () => void
  onAnimate: () => void
  onStopAnimate: () => void
  isAnimating: boolean
  onChangeTab: (tab: "pipeline" | "circuit") => void
  solverHierarchy: BaseSolver[]
  onDownloadConstructorParams: (solver: BaseSolver) => void
  iterationCount?: number
}) => {
  return (
    <div className="p-2">
      <div className="flex gap-2 mb-2">
        <button onClick={props.onStep}>Step</button>
        <button onClick={props.onSolve}>Solve</button>
        <button
          onClick={props.isAnimating ? props.onStopAnimate : props.onAnimate}
        >
          {props.isAnimating ? "Stop" : "Animate"}
        </button>
        {props.iterationCount !== undefined && (
          <div className="flex items-center px-3 py-1 bg-blue-100 rounded text-sm">
            {props.status === "running"
              ? "🔄"
              : props.status === "solved"
                ? "✅"
                : "❌"}{" "}
            Iteration: {props.iterationCount}
          </div>
        )}
        <div className="flex-grow" />
        <div className="flex gap-1">
          <button
            className={`px-3 py-1 rounded-t ${
              props.currentTab === "pipeline"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
            onClick={() => props.onChangeTab("pipeline")}
          >
            Pipeline
          </button>
          <button
            className={`px-3 py-1 rounded-t ${
              props.currentTab === "circuit"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
            onClick={() => props.onChangeTab("circuit")}
          >
            Circuit
          </button>
        </div>
      </div>
      {props.solverHierarchy.length > 1 && (
        <div className="flex items-center gap-1 text-xs text-gray-600">
          <span>Active:</span>
          {props.solverHierarchy.map((solver, index) => (
            <div key={index} className="flex items-center">
              <button
                onClick={() => props.onDownloadConstructorParams(solver)}
                className="hover:text-blue-600 hover:underline cursor-pointer"
              >
                {solver.constructor.name}
              </button>
              {index < props.solverHierarchy.length - 1 && (
                <span className="mx-1">→</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
