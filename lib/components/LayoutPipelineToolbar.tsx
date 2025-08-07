export const LayoutPipelineToolbar = (props: {
  onStep: () => void
  onSolve: () => void
}) => {
  return (
    <div className="flex gap-2 p-2">
      <button onClick={props.onStep}>Step</button>
      <button onClick={props.onSolve}>Solve</button>
    </div>
  )
}
