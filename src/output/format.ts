import type { DotfilesCandidate } from "../domain/types";
import { formatCsvCandidates } from "./csv";
import { formatJsonCandidates } from "./json";

export type OutputFormat = "json" | "csv";

export interface OutputFormatter {
  format(candidates: readonly DotfilesCandidate[]): string;
}

const OUTPUT_FORMATTERS: Record<OutputFormat, OutputFormatter> = {
  json: {
    format: formatJsonCandidates,
  },
  csv: {
    format: formatCsvCandidates,
  },
};

export function formatOutput(candidates: readonly DotfilesCandidate[], format: OutputFormat): string {
  return OUTPUT_FORMATTERS[format].format(candidates);
}
