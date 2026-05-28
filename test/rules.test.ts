import { expect, test } from "bun:test";

import { isBotContributor } from "../src/rules/bots";
import { scoreRepoMetadata } from "../src/rules/scoring";
import type { RepoMetadata } from "../src/domain/types";

test("bot filtering excludes github bot patterns and type Bot", () => {
  const botCases = [
    { type: "Bot" },
    { login: "github-actions[bot]" },
    { login: "dependabot[bot]" },
    { login: "renovate[bot]" },
    { login: "claude[bot]" },
    { login: "copilot[bot]" },
    { login: "someone", name: "GitHub Actions" },
    { login: "someone", name: "Dependabot" },
    { login: "someone", name: "Renovate" },
    { login: "someone", name: "Claude" },
    { login: "someone", name: "Copilot" },
  ];

  for (const candidate of botCases) {
    expect(isBotContributor(candidate)).toBe(true);
  }
});

test("bot filtering keeps human contributors with similar names", () => {
  const humanCases = [
    { login: "claudia", name: "Claudia Rivera" },
    { login: "dependable-dev", name: "Dependable Dev" },
    { login: "renovation", name: "Renovation Lead" },
    { login: "actions-team", name: "Actions Team" },
    { login: "github-ops", name: "GitHub Operations" },
  ];

  for (const candidate of humanCases) {
    expect(isBotContributor(candidate)).toBe(false);
  }
});

test("scoring uses strong, medium, weak signals and keeps stow precedence", () => {
  const repo = makeRepo({
    name: "stow",
    description: "Setup guide",
    topics: ["terminal"],
    language: "Shell",
  });

  const result = scoreRepoMetadata(repo);

  expect(result.score).toBe(9);
  expect(JSON.stringify(result.matchedSignals)).toBe(JSON.stringify([
    {
      key: "stow",
      label: "strong name signal",
      score: 5,
      evidence: 'name includes "stow"',
    },
    {
      key: "terminal",
      label: "medium name/topic signal",
      score: 3,
      evidence: 'topics include "terminal"',
    },
    {
      key: "setup",
      label: "weak description/topic signal",
      score: 1,
      evidence: 'description includes "setup"',
    },
  ]));
});

test("scoring counts stow from topics at medium tier when name does not match", () => {
  const repo = makeRepo({
    name: "plain-repo",
    description: "",
    topics: ["stow", "shell"],
  });

  const result = scoreRepoMetadata(repo);

  expect(result.score).toBe(6);
  expect(JSON.stringify(result.matchedSignals)).toBe(JSON.stringify([
    {
      key: "stow",
      label: "medium name/topic signal",
      score: 3,
      evidence: 'topics include "stow"',
    },
    {
      key: "shell",
      label: "medium name/topic signal",
      score: 3,
      evidence: 'topics include "shell"',
    },
  ]));
});

test("scoring applies fork and archived penalties and clamps at zero", () => {
  const repo = makeRepo({
    name: "config",
    description: "Install setup",
    topics: ["terminal"],
    isFork: true,
    isArchived: true,
  });

  const result = scoreRepoMetadata(repo);

  expect(result.score).toBe(5);
  expect(JSON.stringify(result.matchedSignals)).toBe(JSON.stringify([
    {
      key: "config",
      label: "medium name/topic signal",
      score: 3,
      evidence: 'name includes "config"',
    },
    {
      key: "terminal",
      label: "medium name/topic signal",
      score: 3,
      evidence: 'topics include "terminal"',
    },
    {
      key: "setup",
      label: "weak description/topic signal",
      score: 1,
      evidence: 'description includes "setup"',
    },
    {
      key: "install",
      label: "weak description/topic signal",
      score: 1,
      evidence: 'description includes "install"',
    },
    {
      key: "fork",
      label: "fork penalty",
      score: -1,
      evidence: "repository is a fork",
    },
    {
      key: "archived",
      label: "archived penalty",
      score: -2,
      evidence: "repository is archived",
    },
  ]));

  const clamped = scoreRepoMetadata(
    makeRepo({
      name: "notes",
      description: "",
      topics: [],
      isFork: true,
      isArchived: true,
    }),
  );

  expect(clamped.score).toBe(0);
});

test("scoring stays metadata only and ignores stars and forks counts", () => {
  const baseRepo = makeRepo({
    name: "plain-repo",
    description: "",
    topics: [],
    stars: 0,
    forks: 0,
  });
  const boostedRepo = makeRepo({
    name: "plain-repo",
    description: "",
    topics: [],
    stars: 9999,
    forks: 9999,
  });

  const baseResult = scoreRepoMetadata(baseRepo);
  const boostedResult = scoreRepoMetadata(boostedRepo);

  expect(baseResult.score).toBe(0);
  expect(boostedResult.score).toBe(0);
  expect(JSON.stringify(baseResult.matchedSignals)).toBe(JSON.stringify([]));
  expect(JSON.stringify(boostedResult.matchedSignals)).toBe(JSON.stringify([]));
});

function makeRepo(overrides: Partial<RepoMetadata>): RepoMetadata {
  return {
    owner: "alice",
    name: "repo",
    fullName: "alice/repo",
    url: "https://github.com/alice/repo",
    description: null,
    topics: [],
    stars: 1,
    forks: 1,
    language: null,
    isFork: false,
    isArchived: false,
    updatedAt: null,
    pushedAt: null,
    ...overrides,
  };
}
