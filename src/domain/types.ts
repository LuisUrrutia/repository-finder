export type InputKind = "user" | "repository" | "url" | "file";

export interface UserRef {
  kind: "user";
  login: string;
  url: string;
}

export interface RepositoryRef {
  kind: "repository";
  owner: string;
  name: string;
  fullName: string;
  url: string;
}

export interface UrlInput {
  kind: "url";
  raw: string;
  url: string;
}

export interface FileInput {
  kind: "file";
  raw: string;
  path: string;
}

export type NormalizedInput = UserRef | RepositoryRef | UrlInput | FileInput;

export interface RepoMetadata {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  topics: readonly string[];
  stars: number;
  forks: number;
  language: string | null;
  isFork: boolean;
  isArchived: boolean;
  updatedAt: string | null;
  pushedAt: string | null;
}

export interface Contributor {
  login: string;
  url: string;
  contributions: number;
  isBot: boolean;
}

export interface MatchedSignal {
  key: string;
  label: string;
  score: number;
  evidence: string;
}

export interface DotfilesCandidate {
  url: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  topics: readonly string[];
  stars: number;
  forks: number;
  language: string | null;
  isFork: boolean;
  isArchived: boolean;
  updatedAt: string | null;
  pushedAt: string | null;
  matchedSignals: readonly MatchedSignal[];
  score: number;
  sourceUser: readonly string[];
  sourceInput: readonly string[];
}

export interface ScanWarning {
  code: "invalid-input" | "partial-failure" | "rate-limit";
  message: string;
  input?: string;
  repository?: string;
  contributor?: string;
  retryAfterSeconds?: number;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: string;
}

export interface ScanResult {
  candidates: readonly DotfilesCandidate[];
  warnings: readonly ScanWarning[];
  rateLimit?: RateLimitInfo;
  partialFailure: boolean;
  exitCode: ExitCode;
}

export type ExitCode = 0 | 1 | 2 | 3;

export const EXIT_CODE_SUCCESS = 0 as const;
export const EXIT_CODE_INVALID_INPUT = 1 as const;
export const EXIT_CODE_PARTIAL_FAILURE = 2 as const;
export const EXIT_CODE_RATE_LIMIT_EXHAUSTED = 3 as const;

export const DOTFILES_CANDIDATE_FIELDS = [
  "url",
  "owner",
  "name",
  "fullName",
  "description",
  "topics",
  "stars",
  "forks",
  "language",
  "isFork",
  "isArchived",
  "updatedAt",
  "pushedAt",
  "matchedSignals",
  "score",
  "sourceUser",
  "sourceInput",
] as const satisfies readonly (keyof DotfilesCandidate)[];
