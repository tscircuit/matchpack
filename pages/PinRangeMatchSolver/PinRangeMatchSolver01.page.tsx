export default () => {
  const solver = useMemo(() => {
    const pinRangeMatchSolver = new PinRangeMatchSolver() // TODO populate input

    return pinRangeMatchSolver
  }, [])
  return <GenericSolverDebugger solver={solver} />
}
