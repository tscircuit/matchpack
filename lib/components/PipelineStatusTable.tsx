import type { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"

interface PipelineStageInfo {
  stageNumber: string
  stageName: string
  status: "Not Started" | "In Progress" | "Completed"
  firstIterationStarted: number | null
  downloadInputsData: () => any[]
}

interface PipelineStatusTableProps {
  solver: LayoutPipelineSolver
  runCount: number // Used to trigger re-renders when solver state changes
}

export const PipelineStatusTable = ({
  solver,
  runCount,
}: PipelineStatusTableProps) => {
  const stageNames = [
    "ChipPartitionsSolver",
    "PinRangeMatchSolver",
    "PinRangeLayoutSolver",
    "PinRangeOverlapSolver",
    "PartitionPackingSolver",
  ]

  const getStageInfo = (): PipelineStageInfo[] => {
    return solver.pipelineDef.map((stepDef, index) => {
      const stageNumber = `${(index + 1).toString().padStart(2, "0")}`
      const stageName = stageNames[index] || stepDef.solverName

      // Determine status
      let status: "Not Started" | "In Progress" | "Completed"
      const solverInstance = (solver as any)[stepDef.solverName]

      if (index < solver.currentPipelineStepIndex) {
        status = "Completed"
      } else if (index === solver.currentPipelineStepIndex && solverInstance) {
        status = "In Progress"
      } else {
        status = "Not Started"
      }

      // Get first iteration started (when the solver was first created)
      const firstIterationStarted =
        solver.firstIterationOfPhase[stepDef.solverName] ?? null

      // Create download function for constructor parameters
      const downloadInputsData = () => {
        try {
          return stepDef.getConstructorParams(solver)
        } catch (error) {
          console.error(
            `Failed to get constructor params for ${stepDef.solverName}:`,
            error,
          )
          return []
        }
      }

      return {
        stageNumber,
        stageName,
        status,
        firstIterationStarted,
        downloadInputsData,
      }
    })
  }

  const handleDownload = (stageInfo: PipelineStageInfo) => {
    try {
      const data = stageInfo.downloadInputsData()
      const jsonData = JSON.stringify(data, null, 2)
      const blob = new Blob([jsonData], { type: "application/json" })
      const url = URL.createObjectURL(blob)

      const link = document.createElement("a")
      link.href = url
      link.download = `${stageInfo.stageName}_input_params.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Failed to download stage input params:", error)
      alert("Failed to download input parameters. Check console for details.")
    }
  }

  const stageInfos = getStageInfo()

  return (
    <div style={{ margin: "20px 0" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          border: "1px solid #ccc",
        }}
      >
        <thead>
          <tr style={{ backgroundColor: "#f5f5f5" }}>
            <th
              style={{
                border: "1px solid #ccc",
                padding: "8px",
                textAlign: "left",
              }}
            >
              Stage # / Name
            </th>
            <th
              style={{
                border: "1px solid #ccc",
                padding: "8px",
                textAlign: "left",
              }}
            >
              Status
            </th>
            <th
              style={{
                border: "1px solid #ccc",
                padding: "8px",
                textAlign: "left",
              }}
            >
              i_0
            </th>
            <th
              style={{
                border: "1px solid #ccc",
                padding: "8px",
                textAlign: "left",
              }}
            >
              Input
            </th>
          </tr>
        </thead>
        <tbody>
          {stageInfos.map((stageInfo, index) => (
            <tr key={index}>
              <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                {stageInfo.stageNumber} {stageInfo.stageName}
              </td>
              <td
                style={{
                  border: "1px solid #ccc",
                  padding: "8px",
                  color:
                    stageInfo.status === "Completed"
                      ? "green"
                      : stageInfo.status === "In Progress"
                        ? "orange"
                        : "gray",
                }}
              >
                {stageInfo.status}
              </td>
              <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                {stageInfo.firstIterationStarted !== null
                  ? stageInfo.firstIterationStarted
                  : "-"}
              </td>
              <td style={{ border: "1px solid #ccc", padding: "8px" }}>
                <button
                  onClick={() => handleDownload(stageInfo)}
                  style={{
                    padding: "4px 8px",
                    backgroundColor: "#007bff",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  Download
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
