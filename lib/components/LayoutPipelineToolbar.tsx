export const LayoutPipelineToolbar = (props: {
  currentTab: "pipeline" | "circuit"
  onStep: () => void
  onSolve: () => void
  onAnimate: () => void
  onStopAnimate: () => void
  isAnimating: boolean
  onChangeTab: (tab: "pipeline" | "circuit") => void
  activeSubSolverName?: string
  iterationCount?: number
}) => {
  return (
    <div className="flex gap-2 p-2">
      <button onClick={props.onStep}>Step</button>
      <button onClick={props.onSolve}>Solve</button>
      <button
        onClick={props.isAnimating ? props.onStopAnimate : props.onAnimate}
      >
        {props.isAnimating ? "Stop" : "Animate"}
      </button>
      {props.activeSubSolverName && (
        <div className="flex items-center px-3 py-1 bg-gray-100 rounded text-sm">
          Active: {props.activeSubSolverName}
        </div>
      )}
      {props.iterationCount !== undefined && (
        <div className="flex items-center px-3 py-1 bg-blue-100 rounded text-sm">
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
  )
}
