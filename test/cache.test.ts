import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "bun:test";

import { FileCache, safeCacheKey } from "../src/cache/file-cache";
import { CachedGitHubClient, repoContributorsCacheKey, userReposCacheKey } from "../src/github/cached-client";
import { FakeGitHubClient } from "./fakes/fake-github-client";

test("FileCache misses, hits fresh envelopes, treats stale envelopes as stale, and clears files", async () => {
  const baseDir = await tempCacheDir();
  let now = 1_000;
  const cache = new FileCache({ baseDir, now: () => now });
  const key = "user-repos:{alice}";

  expect(await cache.read<string>(key)).toEqual({ status: "miss" });

  await cache.write(key, "cached", 10);
  expect(await cache.read<string>(key)).toMatchObject({ status: "hit", value: "cached" });

  now = 11_001;
  expect(await cache.read<string>(key)).toMatchObject({ status: "stale" });

  await cache.clear();
  expect(await cache.read<string>(key)).toEqual({ status: "miss" });
});

test("cache keys separate user repositories from repository contributors and stay path-safe", () => {
  const userKey = userReposCacheKey("owner/repo", { perPage: 100 });
  const contributorsKey = repoContributorsCacheKey("owner", "repo", { perPage: 100 });

  expect(userKey).not.toBe(contributorsKey);
  expect(userKey).toBe(userReposCacheKey("owner/repo", { perPage: 100 }));
  expect(safeCacheKey(contributorsKey)).toMatch(/^[a-f0-9]+$/);
});

test("CachedGitHubClient serves fresh user repo cache hits without touching the inner client", async () => {
  const baseDir = await tempCacheDir();
  const cache = new FileCache({ baseDir, now: () => 1_000 });
  const firstInner = new FakeGitHubClient();
  const firstClient = new CachedGitHubClient(firstInner, { cache, ttlSeconds: 60 });

  const firstRepos = await firstClient.listUserRepos("alice", { perPage: 100 });
  expect(firstRepos.length).toBeGreaterThan(0);
  expect(firstInner.callOrder).toEqual(["listUserRepos:alice"]);

  const secondInner = new FakeGitHubClient();
  const secondClient = new CachedGitHubClient(secondInner, { cache, ttlSeconds: 60 });
  const secondRepos = await secondClient.listUserRepos("alice", { perPage: 100 });

  expect(secondRepos.map((repo) => repo.fullName)).toEqual(firstRepos.map((repo) => repo.fullName));
  expect(secondInner.callOrder).toEqual([]);
});

test("CachedGitHubClient refreshes stale contributor cache entries and overwrites them", async () => {
  const baseDir = await tempCacheDir();
  let now = 1_000;
  const cache = new FileCache({ baseDir, now: () => now });
  const firstInner = new FakeGitHubClient();
  const firstClient = new CachedGitHubClient(firstInner, { cache, ttlSeconds: 1 });

  await firstClient.listRepoContributors("shared", "shared-dotfiles", { perPage: 100 });
  expect(firstInner.callOrder).toEqual(["listRepoContributors:shared/shared-dotfiles"]);

  now = 2_001;
  const secondInner = new FakeGitHubClient();
  const secondClient = new CachedGitHubClient(secondInner, { cache, ttlSeconds: 1 });
  await secondClient.listRepoContributors("shared", "shared-dotfiles", { perPage: 100 });

  expect(secondInner.callOrder).toEqual(["listRepoContributors:shared/shared-dotfiles"]);
  const text = await Bun.file(join(baseDir, `${safeCacheKey(repoContributorsCacheKey("shared", "shared-dotfiles", { perPage: 100 }))}.json`)).text();
  expect(JSON.parse(text)).toMatchObject({ fetchedAt: 2_001, ttlSeconds: 1 });
});

async function tempCacheDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "dotfiles-finder-cache-test-"));
}
