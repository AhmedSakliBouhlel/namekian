// http.get/post — runtime provided by js-runtime.ts
// This file provides type information
import { NK_ANY, NK_STRING, NkFunction } from "../checker/types.js";

export const httpGetType: NkFunction = {
  tag: "function",
  params: [NK_STRING],
  returnType: NK_ANY,
  isAsync: true,
};

export const httpPostType: NkFunction = {
  tag: "function",
  params: [NK_STRING, NK_ANY],
  returnType: NK_ANY,
  isAsync: true,
};
