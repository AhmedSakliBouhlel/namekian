// json.encode/decode — runtime provided by js-runtime.ts
// This file provides type information
import { NK_ANY, NK_STRING, NkFunction } from "../checker/types.js";

export const jsonEncodeType: NkFunction = {
  tag: "function",
  params: [NK_ANY],
  returnType: NK_STRING,
};

export const jsonDecodeType: NkFunction = {
  tag: "function",
  params: [NK_STRING],
  returnType: NK_ANY,
};
