export interface MatchResult {
  matched: boolean
  reason?: string
  path?: string[]
  expected?: any
  actual?: any
}
