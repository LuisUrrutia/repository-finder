import { DOTFILES_CANDIDATE_FIELDS, type DotfilesCandidate, type MatchedSignal } from "../domain/types";

const CSV_HEADERS = DOTFILES_CANDIDATE_FIELDS;

function serializeArray(values: readonly string[]): string {
  return values.join(";");
}

function serializeMatchedSignal(signal: MatchedSignal): string {
  return [signal.key, signal.label, String(signal.score), signal.evidence].join("|");
}

function serializeMatchedSignals(signals: readonly MatchedSignal[]): string {
  return signals.map(serializeMatchedSignal).join(";");
}

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function formatCandidate(candidate: DotfilesCandidate): string[] {
  return [
    candidate.url,
    candidate.owner,
    candidate.name,
    candidate.fullName,
    candidate.description ?? "",
    serializeArray([...candidate.topics]),
    String(candidate.stars),
    String(candidate.forks),
    candidate.language ?? "",
    String(candidate.isFork),
    String(candidate.isArchived),
    candidate.updatedAt ?? "",
    candidate.pushedAt ?? "",
    serializeMatchedSignals(candidate.matchedSignals),
    String(candidate.score),
    serializeArray([...candidate.sourceUser]),
    serializeArray([...candidate.sourceInput]),
  ];
}

export function formatCsvCandidates(candidates: readonly DotfilesCandidate[]): string {
  const header = CSV_HEADERS.join(",");
  const rows = candidates.map((candidate) => formatCandidate(candidate).map(escapeCsvCell).join(","));

  return [header, ...rows].join("\n");
}
