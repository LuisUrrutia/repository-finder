import type { Contributor, RepoMetadata } from "../domain/types";
import type { GitHubClient, GitHubListOptions } from "./client";
import { FileCache } from "../cache/file-cache";

export interface CachedGitHubClientOptions {
  cache?: FileCache;
  ttlSeconds?: number;
}

const DEFAULT_TTL_SECONDS = 6 * 60 * 60;

export class CachedGitHubClient implements GitHubClient {
  private readonly inner: GitHubClient;
  private readonly cache: FileCache;
  private readonly ttlSeconds: number;

  constructor(inner: GitHubClient, options: CachedGitHubClientOptions = {}) {
    this.inner = inner;
    this.cache = options.cache ?? new FileCache();
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  async listUserRepos(username: string, options: GitHubListOptions = {}): Promise<readonly RepoMetadata[]> {
    return this.readThrough(userReposCacheKey(username, options), () => this.inner.listUserRepos(username, options));
  }

  async listRepoContributors(owner: string, repo: string, options: GitHubListOptions = {}): Promise<readonly Contributor[]> {
    return this.readThrough(repoContributorsCacheKey(owner, repo, options), () => this.inner.listRepoContributors(owner, repo, options));
  }

  private async readThrough<T>(key: string, load: () => Promise<readonly T[]>): Promise<readonly T[]> {
    const cached = await this.cache.read<readonly T[]>(key);

    if (cached.status === "hit") {
      return cached.value;
    }

    const value = await load();
    await this.cache.write(key, value, this.ttlSeconds);
    return value;
  }
}

export function defaultCacheTtlSeconds(): number {
  return DEFAULT_TTL_SECONDS;
}

export function userReposCacheKey(username: string, options: GitHubListOptions = {}): string {
  return stableCacheKey("user-repos", { username, options: normalizeListOptions(options) });
}

export function repoContributorsCacheKey(owner: string, repo: string, options: GitHubListOptions = {}): string {
  return stableCacheKey("repo-contributors", { owner, repo, options: normalizeListOptions(options) });
}

function stableCacheKey(namespace: string, value: Record<string, unknown>): string {
  return `${namespace}:${JSON.stringify(value)}`;
}

function normalizeListOptions(options: GitHubListOptions): GitHubListOptions {
  return options.perPage === undefined ? {} : { perPage: options.perPage };
}
