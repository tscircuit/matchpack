import { useState } from "react"
import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import type { InputProblem } from "lib/types/InputProblem"

export default function PasteInputPage() {
  const [inputText, setInputText] = useState("")
  const [parsedProblem, setParsedProblem] = useState<InputProblem | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parseInput = () => {
    setError(null)
    setParsedProblem(null)

    if (!inputText.trim()) {
      setError("Please enter some input")
      return
    }

    try {
      let parsed: any

      // First try JSON.parse
      try {
        parsed = JSON.parse(inputText)
      } catch {
        // If JSON parsing fails, try eval (for JavaScript objects)
        try {
          parsed = eval(`(${inputText})`)
        } catch (evalError) {
          throw new Error(`Failed to parse as JSON or JavaScript object: ${evalError}`)
        }
      }

      // Validate that it's an InputProblem
      if (!parsed || typeof parsed !== 'object') {
        throw new Error("Input must be an object")
      }

      const required = ['chipMap', 'chipPinMap', 'netMap', 'pinStrongConnMap', 'netConnMap', 'chipGap', 'partitionGap']
      for (const field of required) {
        if (!(field in parsed)) {
          throw new Error(`Missing required field: ${field}`)
        }
      }

      setParsedProblem(parsed as InputProblem)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred")
    }
  }

  const resetInput = () => {
    setInputText("")
    setParsedProblem(null)
    setError(null)
  }

  if (parsedProblem) {
    return (
      <div>
        <div style={{ padding: "10px", backgroundColor: "#f0f0f0", marginBottom: "10px" }}>
          <button onClick={resetInput} style={{ marginRight: "10px" }}>
            ← Back to Input
          </button>
          <span>Successfully parsed InputProblem</span>
        </div>
        <LayoutPipelineDebugger problem={parsedProblem} />
      </div>
    )
  }

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h1>Paste InputProblem</h1>
      <p>
        Paste a LayoutPipelineSolver InputProblem as JSON or JavaScript object.
        The input will be parsed and opened in the layout debugger.
      </p>

      <div style={{ marginBottom: "20px" }}>
        <label htmlFor="input-text" style={{ display: "block", marginBottom: "10px" }}>
          InputProblem (JSON or JavaScript object):
        </label>
        <textarea
          id="input-text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={`Example JSON:
{
  "chipMap": { "chip1": { "chipId": "chip1", "pins": ["pin1"], "size": {"x": 10, "y": 5} } },
  "chipPinMap": { "pin1": { "pinId": "pin1", "offset": {"x": 0, "y": 0}, "side": "left" } },
  "netMap": {},
  "pinStrongConnMap": {},
  "netConnMap": {},
  "chipGap": 2,
  "partitionGap": 5
}

Or JavaScript object:
{
  chipMap: { chip1: { chipId: "chip1", pins: ["pin1"], size: {x: 10, y: 5} } },
  // ... rest of the properties
}`}
          style={{
            width: "100%",
            height: "300px",
            fontFamily: "monospace",
            fontSize: "14px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            padding: "10px",
          }}
        />
      </div>

      <div style={{ marginBottom: "20px" }}>
        <button
          onClick={parseInput}
          style={{
            padding: "10px 20px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Parse & Debug
        </button>
        <button
          onClick={resetInput}
          style={{
            padding: "10px 20px",
            backgroundColor: "#6c757d",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            marginLeft: "10px",
          }}
        >
          Clear
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "10px",
            backgroundColor: "#f8d7da",
            color: "#721c24",
            border: "1px solid #f5c6cb",
            borderRadius: "4px",
            marginBottom: "20px",
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      <div style={{ fontSize: "14px", color: "#666" }}>
        <h3>Required InputProblem fields:</h3>
        <ul>
          <li><code>chipMap</code>: Record of chip definitions</li>
          <li><code>chipPinMap</code>: Record of chip pin definitions</li>
          <li><code>netMap</code>: Record of net definitions</li>
          <li><code>pinStrongConnMap</code>: Record of strong pin connections</li>
          <li><code>netConnMap</code>: Record of net connections</li>
          <li><code>chipGap</code>: Minimum gap between chips (number)</li>
          <li><code>partitionGap</code>: Minimum gap between partitions (number)</li>
        </ul>
      </div>
    </div>
  )
}