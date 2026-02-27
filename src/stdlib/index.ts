import { NkType, NK_ANY, NK_VOID, NkFunction } from "../checker/types.js";

export interface StdlibModule {
  name: string;
  members: Map<string, NkType>;
}

export function getStdlibType(name: string): NkType | undefined {
  switch (name) {
    case "print":
      return {
        tag: "function",
        params: [NK_ANY],
        returnType: NK_VOID,
      } as NkFunction;
    case "http":
      return NK_ANY; // treated as dynamic module
    case "json":
      return NK_ANY;
    case "math":
      return NK_ANY;
    case "fs":
      return NK_ANY;
    case "stream":
      return NK_ANY;
    default:
      return undefined;
  }
}

export const STDLIB_MODULES = [
  "print",
  "http",
  "json",
  "math",
  "fs",
  "stream",
] as const;
