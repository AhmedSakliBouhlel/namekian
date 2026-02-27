export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  offset: number;
}

export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  location: SourceLocation;
  endLocation?: SourceLocation;
  hint?: string;
}

export function createDiagnostic(
  severity: DiagnosticSeverity,
  message: string,
  location: SourceLocation,
  hint?: string,
): Diagnostic {
  return { severity, message, location, hint };
}

export function errorDiag(
  message: string,
  location: SourceLocation,
  hint?: string,
): Diagnostic {
  return createDiagnostic("error", message, location, hint);
}

export function warnDiag(
  message: string,
  location: SourceLocation,
  hint?: string,
): Diagnostic {
  return createDiagnostic("warning", message, location, hint);
}
