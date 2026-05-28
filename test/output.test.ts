import { expect, test } from "bun:test";

import { formatOutput } from "../src/output/format";
import { formatCsvCandidates } from "../src/output/csv";
import { formatJsonCandidates } from "../src/output/json";
import { DOTFILES_CANDIDATE_FIELDS, type DotfilesCandidate } from "../src/domain/types";

const candidate: DotfilesCandidate = {
  url: "https://github.com/alice/dotfiles",
  owner: "alice",
  name: "dotfiles",
  fullName: "alice/dotfiles",
  description: "Line one, with a quote: \"value\"\nLine two",
  topics: ["dotfiles", "zsh", "stow"],
  stars: 42,
  forks: 7,
  language: "Shell",
  isFork: false,
  isArchived: false,
  updatedAt: "2026-05-25T10:00:00Z",
  pushedAt: "2026-05-25T09:30:00Z",
  matchedSignals: [
    {
      key: "topics",
      label: "topic match",
      score: 4,
      evidence: "topics include dotfiles",
    },
    {
      key: "stow",
      label: "signal match",
      score: 5,
      evidence: "README mentions stow, zsh, and dotfiles",
    },
  ],
  score: 9,
  sourceUser: ["alice", "bob"],
  sourceInput: ["alice", "https://github.com/alice"],
};

test("json formatter preserves approved field order", () => {
  const output = formatJsonCandidates([candidate]);
  const parsed = JSON.parse(output) as Record<string, unknown>[];
  const firstCandidate = parsed[0] ?? {};

  expect(Array.isArray(parsed)).toBe(true);
  expect(JSON.stringify(Object.keys(firstCandidate))).toBe(JSON.stringify([...DOTFILES_CANDIDATE_FIELDS]));
  expect(JSON.stringify(firstCandidate.matchedSignals)).toBe(
    JSON.stringify([
      {
        key: "topics",
        label: "topic match",
        score: 4,
        evidence: "topics include dotfiles",
      },
      {
        key: "stow",
        label: "signal match",
        score: 5,
        evidence: "README mentions stow, zsh, and dotfiles",
      },
    ]),
  );
});

test("csv formatter preserves headers and escapes cells", () => {
  const output = formatCsvCandidates([candidate]);
  const expected = [
    DOTFILES_CANDIDATE_FIELDS.join(","),
    [
      "https://github.com/alice/dotfiles",
      "alice",
      "dotfiles",
      "alice/dotfiles",
      ["\"Line one, with a quote: \"\"value\"\"", "Line two\""].join("\n"),
      "dotfiles;zsh;stow",
      "42",
      "7",
      "Shell",
      "false",
      "false",
      "2026-05-25T10:00:00Z",
      "2026-05-25T09:30:00Z",
      '"topics|topic match|4|topics include dotfiles;stow|signal match|5|README mentions stow, zsh, and dotfiles"',
      "9",
      "alice;bob",
      "alice;https://github.com/alice",
    ].join(","),
  ].join("\n");

  expect(output).toBe(expected);
  expect(output.startsWith(DOTFILES_CANDIDATE_FIELDS.join(","))).toBe(true);
  expect(output).toContain("dotfiles;zsh;stow");
  expect(output).toContain("alice;bob");
  expect(output).toContain("alice;https://github.com/alice");
});

test("format dispatcher routes json and csv", () => {
  expect(formatOutput([candidate], "json")).toBe(formatJsonCandidates([candidate]));
  expect(formatOutput([candidate], "csv")).toBe(formatCsvCandidates([candidate]));
});
