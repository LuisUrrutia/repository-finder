export interface BotCandidateLike {
  isBot?: boolean;
  type?: string | null;
  login?: string | null;
  name?: string | null;
}

const BOT_PATTERNS = ["github-actions", "github actions", "dependabot", "renovate", "claude", "copilot", "[bot]"] as const;

export function isBotContributor(candidate: BotCandidateLike): boolean {
  if (candidate.isBot === true || candidate.type === "Bot") {
    return true;
  }

  const login = candidate.login?.toLowerCase() ?? "";
  const name = candidate.name?.toLowerCase() ?? "";

  return BOT_PATTERNS.some((pattern) => login.includes(pattern) || name.includes(pattern));
}
