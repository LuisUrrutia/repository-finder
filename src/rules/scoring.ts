import type { MatchedSignal, RepoMetadata } from "../domain/types";

export interface RepoScoreResult {
  score: number;
  matchedSignals: readonly MatchedSignal[];
}

const STRONG_NAME_SIGNALS = ["dotfiles", ".files", "chezmoi", "home-manager", "nix-config", "nvim-config", "stow"] as const;
const MEDIUM_NAME_TOPIC_SIGNALS = ["nvim", "neovim", "vimrc", "zsh", "zshrc", "tmux", "config", "configs", "stow", "brewfile", "terminal", "shell"] as const;
const WEAK_DESCRIPTION_TOPIC_SIGNALS = ["setup", "macos", "linux", "developer environment", "dev environment", "workstation", "bootstrap", "install"] as const;

export function scoreRepoMetadata(repo: RepoMetadata): RepoScoreResult {
  const name = normalizeText(repo.name);
  const description = normalizeText(repo.description ?? "");
  const topics = repo.topics.map((topic) => normalizeText(topic));
  const matchedSignals: MatchedSignal[] = [];
  let score = 0;
  const matchedTerms = new Set<string>();

  for (const term of STRONG_NAME_SIGNALS) {
    if (matchesText(name, term)) {
      score += 5;
      matchedSignals.push(buildSignal(term, "strong name signal", 5, `name includes "${term}"`));
      matchedTerms.add(term);
    }
  }

  for (const term of MEDIUM_NAME_TOPIC_SIGNALS) {
    if (matchedTerms.has(term)) {
      continue;
    }

    if (matchesText(name, term)) {
      score += 3;
      matchedSignals.push(buildSignal(term, "medium name/topic signal", 3, `name includes "${term}"`));
      matchedTerms.add(term);
      continue;
    }

    if (topics.some((topic) => matchesText(topic, term))) {
      score += 3;
      matchedSignals.push(buildSignal(term, "medium name/topic signal", 3, `topics include "${term}"`));
      matchedTerms.add(term);
    }
  }

  for (const term of WEAK_DESCRIPTION_TOPIC_SIGNALS) {
    if (matchedTerms.has(term)) {
      continue;
    }

    if (description.includes(term)) {
      score += 1;
      matchedSignals.push(buildSignal(term, "weak description/topic signal", 1, `description includes "${term}"`));
      matchedTerms.add(term);
      continue;
    }

    if (topics.some((topic) => matchesText(topic, term))) {
      score += 1;
      matchedSignals.push(buildSignal(term, "weak description/topic signal", 1, `topics include "${term}"`));
      matchedTerms.add(term);
    }
  }

  if (repo.isFork) {
    score -= 1;
    matchedSignals.push(buildSignal("fork", "fork penalty", -1, "repository is a fork"));
  }

  if (repo.isArchived) {
    score -= 2;
    matchedSignals.push(buildSignal("archived", "archived penalty", -2, "repository is archived"));
  }

  return {
    score: Math.max(0, score),
    matchedSignals,
  };
}

function buildSignal(key: string, label: string, score: number, evidence: string): MatchedSignal {
  return { key, label, score, evidence };
}

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function matchesText(haystack: string, term: string): boolean {
  return haystack.includes(term);
}
