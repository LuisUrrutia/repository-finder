import { createUnauthenticatedRestWarning, type GitHubClient, type SelectedGitHubClient } from "./client";
import { GhGitHubClient, type GhCommandRunner } from "./gh-adapter";
import { RestGitHubClient, type GitHubFetch } from "./rest-adapter";

export interface GitHubClientSelectionEnv {
  GH_TOKEN?: string;
  GITHUB_TOKEN?: string;
  [key: string]: string | undefined;
}

export interface GitHubClientProbes {
  isGhAuthenticated(): Promise<boolean>;
}

export interface SelectGitHubClientOptions {
  probes: GitHubClientProbes;
  ghRunner: GhCommandRunner;
  fetch?: GitHubFetch;
  env?: GitHubClientSelectionEnv;
}

export async function selectGitHubClient(options: SelectGitHubClientOptions): Promise<SelectedGitHubClient> {
  if (await options.probes.isGhAuthenticated()) {
    return {
      kind: "gh",
      client: new GhGitHubClient({ run: options.ghRunner, env: options.env }),
      warnings: [],
    };
  }

  const token = options.env?.GH_TOKEN ?? options.env?.GITHUB_TOKEN;

  if (token !== undefined && token.length > 0) {
    return {
      kind: "rest-token",
      client: new RestGitHubClient({ fetch: options.fetch, token }),
      warnings: [],
    };
  }

  return {
    kind: "rest-public",
    client: new RestGitHubClient({ fetch: options.fetch }),
    warnings: [createUnauthenticatedRestWarning()],
  };
}

export async function probeGhAuthenticated(run: GhCommandRunner): Promise<boolean> {
  try {
    await run({ command: "gh", args: ["auth", "status"], env: { GH_PROMPT_DISABLED: "1" } });
    return true;
  } catch {
    return false;
  }
}

export function createDefaultGitHubClient(env: GitHubClientSelectionEnv = processEnv()): Promise<SelectedGitHubClient> {
  const ghRunner = createBunGhRunner(env);
  return selectGitHubClient({
    probes: { isGhAuthenticated: () => probeGhAuthenticated(ghRunner) },
    ghRunner,
    env,
  });
}

function createBunGhRunner(env: GitHubClientSelectionEnv): GhCommandRunner {
  return async (command) => {
    const subprocess = Bun.spawn([command.command, ...command.args], {
      env: { ...definedEnv(env), ...command.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(subprocess.stdout).text();
    const stderr = await new Response(subprocess.stderr).text();
    const exitCode = await subprocess.exited;

    if (exitCode !== 0) {
      if (command.args[0] === "api") {
        return { stdout, stderr, status: exitCode };
      }

      throw new Error(stderr || `gh exited with status ${exitCode}`);
    }

    return { stdout, stderr, status: exitCode };
  };
}

function processEnv(): GitHubClientSelectionEnv {
  const env: GitHubClientSelectionEnv = {};

  for (const [key, value] of Object.entries(process.env)) {
    env[key] = value;
  }

  return env;
}

function definedEnv(env: GitHubClientSelectionEnv): Record<string, string> {
  const next: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }

  return next;
}
