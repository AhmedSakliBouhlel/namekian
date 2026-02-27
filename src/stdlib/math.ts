// math.* maps to Math.* in codegen
// This file provides type information
import { NK_FLOAT, NkFunction } from "../checker/types.js";

export const mathAbsType: NkFunction = {
  tag: "function",
  params: [NK_FLOAT],
  returnType: NK_FLOAT,
};

export const mathSqrtType: NkFunction = {
  tag: "function",
  params: [NK_FLOAT],
  returnType: NK_FLOAT,
};
