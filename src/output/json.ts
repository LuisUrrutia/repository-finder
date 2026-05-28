import { DOTFILES_CANDIDATE_FIELDS, type DotfilesCandidate, type MatchedSignal } from "../domain/types";

interface JsonCandidate extends Record<(typeof DOTFILES_CANDIDATE_FIELDS)[number], unknown> {}

function formatMatchedSignal(signal: MatchedSignal): Record<string, unknown> {
  return {
    key: signal.key,
    label: signal.label,
    score: signal.score,
    evidence: signal.evidence,
  };
}

function formatCandidate(candidate: DotfilesCandidate): JsonCandidate {
  return {
    url: candidate.url,
    owner: candidate.owner,
    name: candidate.name,
    fullName: candidate.fullName,
    description: candidate.description,
    topics: [...candidate.topics],
    stars: candidate.stars,
    forks: candidate.forks,
    language: candidate.language,
    isFork: candidate.isFork,
    isArchived: candidate.isArchived,
    updatedAt: candidate.updatedAt,
    pushedAt: candidate.pushedAt,
    matchedSignals: candidate.matchedSignals.map(formatMatchedSignal),
    score: candidate.score,
    sourceUser: [...candidate.sourceUser],
    sourceInput: [...candidate.sourceInput],
  };
}

export function formatJsonCandidates(candidates: readonly DotfilesCandidate[]): string {
  return JSON.stringify(candidates.map(formatCandidate));
}
