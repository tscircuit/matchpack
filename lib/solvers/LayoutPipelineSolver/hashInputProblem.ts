import type { InputProblem } from "lib/types/InputProblem"

export const hashInputProblem = (inputProblem: InputProblem) => {
  return JSON.stringify(inputProblem)
}
