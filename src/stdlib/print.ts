// print() maps directly to console.log in codegen
// This file provides type information for the checker
import { NK_ANY, NK_VOID, NkFunction } from "../checker/types.js";

export const printType: NkFunction = {
  tag: "function",
  params: [NK_ANY],
  returnType: NK_VOID,
};
