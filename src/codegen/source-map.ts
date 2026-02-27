const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeVLQ(value: number): string {
  // Convert signed value to unsigned VLQ representation.
  // The least significant bit of the first group is the sign bit.
  let vlq = value < 0 ? (-value << 1) | 1 : value << 1;

  let result = "";
  do {
    // Take 5 bits at a time.
    let digit = vlq & 0x1f;
    vlq >>>= 5;
    // If there are more bits remaining, set the continuation bit (bit 5).
    if (vlq > 0) {
      digit |= 0x20;
    }
    result += BASE64_CHARS[digit];
  } while (vlq > 0);

  return result;
}

interface Mapping {
  generatedLine: number;
  generatedColumn: number;
  sourceLine: number;
  sourceColumn: number;
  sourceIndex: number;
}

interface SourceMapV3 {
  version: number;
  file: string;
  sources: string[];
  sourcesContent?: string[];
  mappings: string;
  names: string[];
}

export class SourceMapGenerator {
  private mappings: Mapping[] = [];

  addMapping(mapping: {
    generatedLine: number;
    generatedColumn: number;
    sourceLine: number;
    sourceColumn: number;
    sourceIndex: number;
  }): void {
    this.mappings.push({ ...mapping });
  }

  toJSON(
    file: string,
    sources: string[],
    sourcesContent?: string[],
  ): SourceMapV3 {
    const mappings = this.encodeMappings();

    const result: SourceMapV3 = {
      version: 3,
      file,
      sources,
      mappings,
      names: [],
    };

    if (sourcesContent !== undefined) {
      result.sourcesContent = sourcesContent;
    }

    return result;
  }

  private encodeMappings(): string {
    // Group mappings by generated line.
    const byLine = new Map<number, Mapping[]>();
    for (const mapping of this.mappings) {
      const line = mapping.generatedLine;
      if (!byLine.has(line)) {
        byLine.set(line, []);
      }
      byLine.get(line)!.push(mapping);
    }

    if (byLine.size === 0) {
      return "";
    }

    const maxLine = Math.max(...byLine.keys());
    const lineSegments: string[] = [];

    // Track previous values for delta encoding across all segments.
    let prevGeneratedColumn = 0;
    let prevSourceIndex = 0;
    let prevSourceLine = 0;
    let prevSourceColumn = 0;

    for (let lineNum = 0; lineNum <= maxLine; lineNum++) {
      const lineMappings = byLine.get(lineNum);

      if (!lineMappings || lineMappings.length === 0) {
        lineSegments.push("");
        // Reset generated column delta at the start of each new line.
        prevGeneratedColumn = 0;
        continue;
      }

      // Sort segments within a line by generated column.
      lineMappings.sort((a, b) => a.generatedColumn - b.generatedColumn);

      // Reset generated column delta at the start of each line.
      prevGeneratedColumn = 0;

      const segments: string[] = [];
      for (const mapping of lineMappings) {
        const deltaGeneratedColumn =
          mapping.generatedColumn - prevGeneratedColumn;
        const deltaSourceIndex = mapping.sourceIndex - prevSourceIndex;
        const deltaSourceLine = mapping.sourceLine - prevSourceLine;
        const deltaSourceColumn = mapping.sourceColumn - prevSourceColumn;

        const segment =
          encodeVLQ(deltaGeneratedColumn) +
          encodeVLQ(deltaSourceIndex) +
          encodeVLQ(deltaSourceLine) +
          encodeVLQ(deltaSourceColumn);

        segments.push(segment);

        prevGeneratedColumn = mapping.generatedColumn;
        prevSourceIndex = mapping.sourceIndex;
        prevSourceLine = mapping.sourceLine;
        prevSourceColumn = mapping.sourceColumn;
      }

      lineSegments.push(segments.join(","));
    }

    return lineSegments.join(";");
  }
}
