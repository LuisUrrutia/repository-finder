import { expect, test } from "bun:test";

import { normalizeInputs } from "../src/input/normalize";

test("normalizes users, repositories, and GitHub URLs", async () => {
  const result = await normalizeInputs([
    "LuisUrrutia",
    "LuisUrrutia/dotfiles",
    "https://github.com/LuisUrrutia",
    "https://github.com/LuisUrrutia/dotfiles",
    "https://github.com/LuisUrrutia/dotfiles/",
    "https://github.com/LuisUrrutia/dotfiles.git",
    "https://github.com/LuisUrrutia/dotfiles/issues",
  ]);

  expect(JSON.stringify(result.errors)).toBe("[]");
  expect(JSON.stringify(result.inputs)).toBe(
    JSON.stringify([
      {
        kind: "user",
        login: "LuisUrrutia",
        url: "https://github.com/LuisUrrutia",
      },
      {
        kind: "repository",
        owner: "LuisUrrutia",
        name: "dotfiles",
        fullName: "LuisUrrutia/dotfiles",
        url: "https://github.com/LuisUrrutia/dotfiles",
      },
    ]),
  );
});

test("expands --file and @path inputs as newline text", async () => {
  const files = new Map([
    [
      "inputs.txt",
      [
        "# comment before values",
        " LuisUrrutia ",
        "",
        "LuisUrrutia/dotfiles",
        " https://github.com/another-user ",
      ].join("\n"),
    ],
    ["more-inputs.txt", "https://github.com/another-user/dotfiles/issues\n# ignored"],
  ]);
  const readPaths: string[] = [];

  const result = await normalizeInputs(["--file", "inputs.txt", "@more-inputs.txt"], {
    readFile: (path) => {
      readPaths.push(path);
      const text = files.get(path);

      if (text === undefined) {
        throw new Error(`unexpected path ${path}`);
      }

      return text;
    },
  });

  expect(JSON.stringify(readPaths)).toBe(JSON.stringify(["inputs.txt", "more-inputs.txt"]));
  expect(JSON.stringify(result.errors)).toBe("[]");
  expect(JSON.stringify(result.inputs)).toBe(
    JSON.stringify([
      {
        kind: "user",
        login: "LuisUrrutia",
        url: "https://github.com/LuisUrrutia",
      },
      {
        kind: "repository",
        owner: "LuisUrrutia",
        name: "dotfiles",
        fullName: "LuisUrrutia/dotfiles",
        url: "https://github.com/LuisUrrutia/dotfiles",
      },
      {
        kind: "user",
        login: "another-user",
        url: "https://github.com/another-user",
      },
      {
        kind: "repository",
        owner: "another-user",
        name: "dotfiles",
        fullName: "another-user/dotfiles",
        url: "https://github.com/another-user/dotfiles",
      },
    ]),
  );
});

test("deduplicates mixed inputs in first-seen order", async () => {
  const result = await normalizeInputs([
    "LuisUrrutia/dotfiles",
    "https://github.com/LuisUrrutia/dotfiles/issues",
    "luisurrutia/dotfiles.git",
    "LuisUrrutia",
    "https://github.com/luisurrutia/",
  ]);

  expect(JSON.stringify(result.errors)).toBe("[]");
  expect(JSON.stringify(result.inputs)).toBe(
    JSON.stringify([
      {
        kind: "repository",
        owner: "LuisUrrutia",
        name: "dotfiles",
        fullName: "LuisUrrutia/dotfiles",
        url: "https://github.com/LuisUrrutia/dotfiles",
      },
      {
        kind: "user",
        login: "LuisUrrutia",
        url: "https://github.com/LuisUrrutia",
      },
    ]),
  );
});

test("returns structured errors for malformed values", async () => {
  const result = await normalizeInputs([
    "not a valid/input/too/many",
    "https://example.com/LuisUrrutia",
    "--file",
  ]);
  const emptyAtResult = await normalizeInputs(["@"]); 

  expect(JSON.stringify(result.inputs)).toBe("[]");
  expect(JSON.stringify(result.errors)).toBe(
    JSON.stringify([
      {
        code: "invalid-input",
        input: "not a valid/input/too/many",
        message: "Invalid GitHub input: not a valid/input/too/many",
      },
      {
        code: "invalid-input",
        input: "https://example.com/LuisUrrutia",
        message: "Invalid GitHub input: https://example.com/LuisUrrutia",
      },
      {
        code: "missing-file-path",
        input: "--file",
        message: "Missing path after --file",
      },
    ]),
  );
  expect(JSON.stringify(emptyAtResult.errors)).toBe(
    JSON.stringify([
      {
        code: "missing-file-path",
        input: "@",
        message: "Missing path after @",
      },
    ]),
  );
});

test("does not read arbitrary arguments as files", async () => {
  const readPaths: string[] = [];
  const result = await normalizeInputs(["fixtures/nested/input.txt", "--file", "actual-file.txt"], {
    readFile: (path) => {
      readPaths.push(path);
      return "LuisUrrutia";
    },
  });

  expect(JSON.stringify(readPaths)).toBe(JSON.stringify(["actual-file.txt"]));
  expect(JSON.stringify(result.inputs)).toBe(
    JSON.stringify([
      {
        kind: "user",
        login: "LuisUrrutia",
        url: "https://github.com/LuisUrrutia",
      },
    ]),
  );
  expect(JSON.stringify(result.errors)).toBe(
    JSON.stringify([
      {
        code: "invalid-input",
        input: "fixtures/nested/input.txt",
        message: "Invalid GitHub input: fixtures/nested/input.txt",
      },
    ]),
  );
});

test("returns structured file read errors", async () => {
  const result = await normalizeInputs(["@missing.txt"], {
    readFile: () => {
      throw new Error("raw file system error");
    },
  });

  expect(JSON.stringify(result.inputs)).toBe("[]");
  expect(JSON.stringify(result.errors)).toBe(
    JSON.stringify([
      {
        code: "file-read-failed",
        input: "missing.txt",
        message: "Could not read input file: missing.txt",
        source: "@missing.txt",
      },
    ]),
  );
});
