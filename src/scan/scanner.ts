import type { Contributor, DotfilesCandidate, NormalizedInput, RepoMetadata, ScanResult, ScanWarning } from "../domain/types";
import { EXIT_CODE_PARTIAL_FAILURE, EXIT_CODE_RATE_LIMIT_EXHAUSTED, EXIT_CODE_SUCCESS } from "../domain/types";
import { type GitHubClient, GitHubClientError } from "../github/client";
import { isBotContributor } from "../rules/bots";
import { scoreRepoMetadata } from "../rules/scoring";

export interface ScanOptions {
  maxContributors?: number;
  maxRepos?: number;
}

const DEFAULT_MAX_CONTRIBUTORS = 50;

export async function scanInputs(inputs: readonly NormalizedInput[], client: GitHubClient, options: ScanOptions = {}): Promise<ScanResult> {
  const maxContributors = options.maxContributors ?? DEFAULT_MAX_CONTRIBUTORS;
  const warnings: ScanWarning[] = [];
  const candidates = new Map<string, DotfilesCandidate>();

  for (const input of inputs) {
    if (input.kind === "user") {
      const status = await scanUser(input.login, input.login, input.login, client, candidates, warnings, options.maxRepos);

      if (status === "rate-limit") {
        return buildResult(candidates, warnings, true);
      }

      continue;
    }

    if (input.kind === "repository") {
      const status = await scanRepositoryInput(input, client, candidates, warnings, maxContributors, options.maxRepos);

      if (status === "rate-limit") {
        return buildResult(candidates, warnings, true);
      }
    }
  }

  return buildResult(candidates, warnings, false);
}

async function scanRepositoryInput(
  input: Extract<NormalizedInput, { kind: "repository" }>,
  client: GitHubClient,
  candidates: Map<string, DotfilesCandidate>,
  warnings: ScanWarning[],
  maxContributors: number,
  maxRepos: number | undefined,
): Promise<"ok" | "rate-limit"> {
  let contributors: readonly Contributor[];

  try {
    contributors = await client.listRepoContributors(input.owner, input.name);
  } catch (error) {
    return handleClientError(error, warnings, { input: input.fullName, repository: input.fullName });
  }

  let humanCount = 0;

  for (const contributor of contributors) {
    if (isBotContributor(contributor)) {
      continue;
    }

    if (humanCount >= maxContributors) {
      break;
    }

    humanCount += 1;

    const status = await scanUser(contributor.login, contributor.login, input.fullName, client, candidates, warnings, maxRepos, input.fullName);

    if (status === "rate-limit") {
      return "rate-limit";
    }
  }

  return "ok";
}

async function scanUser(
  login: string,
  sourceUser: string,
  sourceInput: string,
  client: GitHubClient,
  candidates: Map<string, DotfilesCandidate>,
  warnings: ScanWarning[],
  maxRepos: number | undefined,
  repository?: string,
): Promise<"ok" | "rate-limit"> {
  let repos: readonly RepoMetadata[];

  try {
    repos = await client.listUserRepos(login);
  } catch (error) {
    return handleClientError(error, warnings, { input: sourceInput, repository, contributor: login });
  }

  const reposToScan = maxRepos === undefined ? repos : repos.slice(0, maxRepos);

  for (const repo of reposToScan) {
    addCandidate(candidates, repo, sourceUser, sourceInput);
  }

  return "ok";
}

function addCandidate(candidates: Map<string, DotfilesCandidate>, repo: RepoMetadata, sourceUser: string, sourceInput: string): void {
  const existing = candidates.get(repo.fullName);

  if (existing !== undefined) {
    candidates.set(repo.fullName, {
      ...existing,
      sourceUser: appendUnique(existing.sourceUser, sourceUser),
      sourceInput: appendUnique(existing.sourceInput, sourceInput),
    });
    return;
  }

  const score = scoreRepoMetadata(repo);

  candidates.set(repo.fullName, {
    url: repo.url,
    owner: repo.owner,
    name: repo.name,
    fullName: repo.fullName,
    description: repo.description,
    topics: [...repo.topics],
    stars: repo.stars,
    forks: repo.forks,
    language: repo.language,
    isFork: repo.isFork,
    isArchived: repo.isArchived,
    updatedAt: repo.updatedAt,
    pushedAt: repo.pushedAt,
    matchedSignals: score.matchedSignals,
    score: score.score,
    sourceUser: [sourceUser],
    sourceInput: [sourceInput],
  });
}

function handleClientError(
  error: unknown,
  warnings: ScanWarning[],
  context: Pick<ScanWarning, "input" | "repository" | "contributor">,
): "ok" | "rate-limit" {
  const normalized = normalizeClientError(error, context);
  warnings.push(normalized);

  return normalized.code === "rate-limit" ? "rate-limit" : "ok";
}

function normalizeClientError(error: unknown, context: Pick<ScanWarning, "input" | "repository" | "contributor">): ScanWarning {
  if (error instanceof GitHubClientError) {
    return {
      code: error.kind === "rate-limit" ? "rate-limit" : "partial-failure",
      message: error.message,
      input: context.input,
      repository: context.repository,
      contributor: context.contributor,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }

  if (isRateLimitLike(error)) {
    return {
      code: "rate-limit",
      message: error.message,
      input: context.input,
      repository: context.repository,
      contributor: context.contributor,
      retryAfterSeconds: error.retryAfterSeconds,
    };
  }

  return {
    code: "partial-failure",
    message: error instanceof Error ? error.message : "GitHub request failed.",
    input: context.input,
    repository: context.repository,
    contributor: context.contributor,
  };
}

function isRateLimitLike(error: unknown): error is Error & { retryAfterSeconds?: number; status?: number; remaining?: number } {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidate = error as Error & { retryAfterSeconds?: number; status?: number; remaining?: number };
  return candidate.status === 429 || candidate.remaining === 0 || candidate.retryAfterSeconds !== undefined;
}

function appendUnique(values: readonly string[], value: string): readonly string[] {
  if (values.includes(value)) {
    return values;
  }

  return [...values, value];
}

function buildResult(candidates: Map<string, DotfilesCandidate>, warnings: readonly ScanWarning[], rateLimited: boolean): ScanResult {
  return {
    candidates: [...candidates.values()],
    warnings,
    partialFailure: warnings.length > 0,
    exitCode: rateLimited ? EXIT_CODE_RATE_LIMIT_EXHAUSTED : warnings.length > 0 ? EXIT_CODE_PARTIAL_FAILURE : EXIT_CODE_SUCCESS,
  };
}
