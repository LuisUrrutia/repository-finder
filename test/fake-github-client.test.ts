import { expect, test } from "bun:test";

import { GITHUB_FIXTURE_REPOS } from "./fixtures/github";
import { FakeGitHubClient, createFakeGitHubApiError } from "./fakes/fake-github-client";

test("fake github client records exact call order", async () => {
  const client = new FakeGitHubClient();

  const repos = await client.listUserRepos("alice");
  const contributors = await client.listRepoContributors(repos[0].owner, repos[0].name);
  const duplicateRepos = await client.listUserRepos("charlie");

  expect(client.callOrder.join(",")).toBe("listUserRepos:alice,listRepoContributors:alice/dotfiles,listUserRepos:charlie");
  expect(repos[0].fullName).toBe("alice/dotfiles");
  expect(contributors.length).toBe(5);
  expect(duplicateRepos[1].fullName).toBe(GITHUB_FIXTURE_REPOS[2].fullName);
});

test("fake github client simulates rate limit failures", async () => {
  const client = new FakeGitHubClient();
  client.queueFailure("listUserRepos", "bob", createFakeGitHubApiError(429, "rate limited", 60));
  client.queueFailure("listRepoContributors", "alice/dotfiles", createFakeGitHubApiError(403, "forbidden", 15));

  try {
    await client.listUserRepos("bob");
    throw new Error("expected listUserRepos to throw");
  } catch (error) {
    const apiError = error as { status?: number; retryAfterSeconds?: number; remaining?: number; message?: string };
    expect(apiError.status).toBe(429);
    expect(apiError.retryAfterSeconds).toBe(60);
    expect(apiError.remaining).toBe(0);
    expect(apiError.message).toBe("rate limited");
  }

  try {
    await client.listRepoContributors("alice", "dotfiles");
    throw new Error("expected listRepoContributors to throw");
  } catch (error) {
    const apiError = error as { status?: number; retryAfterSeconds?: number; remaining?: number; message?: string };
    expect(apiError.status).toBe(403);
    expect(apiError.retryAfterSeconds).toBe(15);
    expect(apiError.remaining).toBe(0);
    expect(apiError.message).toBe("forbidden");
  }

  expect(client.callOrder.join(",")).toBe("listUserRepos:bob,listRepoContributors:alice/dotfiles");
});
