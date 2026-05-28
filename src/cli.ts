import { FileCache } from "./cache/file-cache";
import { EXIT_CODE_INVALID_INPUT, type DotfilesCandidate, type ExitCode, type ScanResult, type ScanWarning } from "./domain/types";
import { type SelectedGitHubClient } from "./github/client";
import { CachedGitHubClient, defaultCacheTtlSeconds } from "./github/cached-client";
import { createDefaultGitHubClient } from "./github/select-client";
import { normalizeInputs, type NormalizeInputsOptions, type NormalizeInputsResult } from "./input/normalize";
import { formatOutput, type OutputFormat } from "./output/format";
import { scanInputs, type ScanOptions } from "./scan/scanner";

export const VERSION = "0.0.0";

const DEFAULT_FORMAT: OutputFormat = "json";
const DEFAULT_MIN_SCORE = 3;
const DEFAULT_MAX_CONTRIBUTORS = 50;
const DEFAULT_CACHE_TTL_SECONDS = defaultCacheTtlSeconds();

export interface CliWriters {
  stdout(value: string): void;
  stderr(value: string): void;
}

export interface CliDependencies {
  normalizeInputs(args: readonly string[], options?: NormalizeInputsOptions): Promise<NormalizeInputsResult>;
  createDefaultGitHubClient(): Promise<SelectedGitHubClient>;
  scanInputs(inputs: NormalizeInputsResult["inputs"], client: SelectedGitHubClient["client"], options: ScanOptions): Promise<ScanResult>;
  formatOutput(candidates: readonly DotfilesCandidate[], format: OutputFormat): string;
  createFileCache(): FileCache;
}

interface ParsedCliArgs {
  inputArgs: string[];
  format: OutputFormat;
  minScore: number;
  maxContributors: number;
  maxRepos?: number;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
  clearCache: boolean;
  help: boolean;
  version: boolean;
}

type ParseResult = { args: ParsedCliArgs } | { errors: string[] };

export function formatUsage(): string {
  return [
    "Usage: dotfiles-finder [options] <user|owner/repo|github-url|@file> [...]",
    "",
    "Find likely dotfiles repositories from GitHub users, repositories, URLs, or input files.",
    "",
    "Inputs:",
    "  LuisUrrutia                         GitHub username",
    "  LuisUrrutia/dotfiles                GitHub repository",
    "  https://github.com/LuisUrrutia      GitHub user URL",
    "  https://github.com/LuisUrrutia/repo GitHub repository URL",
    "  @path                               Read newline-delimited inputs from a file",
    "",
    "Options:",
    "  --format <json|csv>        Output format (default: json)",
    "  --file <path>              Read newline-delimited inputs from a file",
    "  --min-score <number>       Minimum candidate score, 0 or greater (default: 3)",
    "  --max-contributors <n>     Maximum human contributors per repository, 1 or greater (default: 50)",
    "  --max-repos <n>            Maximum repositories scanned per user, 1 or greater (default: unlimited)",
    "  --no-cache                 Disable persistent GitHub API response cache",
    "  --cache-ttl <seconds>      Cache TTL in finite seconds, 0 or greater (default: 21600)",
    "  --clear-cache              Clear persistent cache and exit",
    "  --help, -h                 Show this help text",
    "  --version, -v              Show version",
  ].join("\n");
}

export async function runCli(args: string[], writers: Partial<CliWriters> = {}, dependencies: Partial<CliDependencies> = {}): Promise<ExitCode> {
  const resolvedWriters: CliWriters = {
    stdout: writers.stdout ?? ((value) => console.log(value)),
    stderr: writers.stderr ?? ((value) => console.error(value)),
  };
  const resolvedDependencies: CliDependencies = {
    normalizeInputs,
    createDefaultGitHubClient,
    scanInputs,
    formatOutput,
    createFileCache: () => new FileCache(),
    ...dependencies,
  };
  const parsed = parseCliArgs(args);

  if ("errors" in parsed) {
    writeErrors(resolvedWriters, parsed.errors);
    return EXIT_CODE_INVALID_INPUT;
  }

  if (parsed.args.version) {
    resolvedWriters.stdout(VERSION);
    return 0;
  }

  if (parsed.args.help || args.length === 0) {
    resolvedWriters.stdout(formatUsage());
    return 0;
  }

  if (parsed.args.clearCache) {
    await resolvedDependencies.createFileCache().clear();
    return 0;
  }

  const normalized = await resolvedDependencies.normalizeInputs(parsed.args.inputArgs);

  if (normalized.errors.length > 0 || normalized.inputs.length === 0) {
    const errors = normalized.errors.map((error) => error.source === undefined ? error.message : `${error.message} (${error.source})`);
    writeErrors(resolvedWriters, errors.length > 0 ? errors : ["At least one GitHub user, repository, URL, or input file is required."]);
    return EXIT_CODE_INVALID_INPUT;
  }

  let selectedClient: SelectedGitHubClient;

  try {
    selectedClient = await resolvedDependencies.createDefaultGitHubClient();
  } catch (error) {
    writeErrors(resolvedWriters, [`Could not configure GitHub client: ${formatUnknownError(error)}`]);
    return EXIT_CODE_INVALID_INPUT;
  }

  writeWarnings(resolvedWriters, selectedClient.warnings);

  const githubClient = parsed.args.cacheEnabled
    ? new CachedGitHubClient(selectedClient.client, { cache: resolvedDependencies.createFileCache(), ttlSeconds: parsed.args.cacheTtlSeconds })
    : selectedClient.client;

  const result = await resolvedDependencies.scanInputs(normalized.inputs, githubClient, {
    maxContributors: parsed.args.maxContributors,
    maxRepos: parsed.args.maxRepos,
  });
  const candidates = result.candidates.filter((candidate) => candidate.score >= parsed.args.minScore);

  resolvedWriters.stdout(resolvedDependencies.formatOutput(candidates, parsed.args.format));
  writeWarnings(resolvedWriters, result.warnings);

  return result.exitCode;
}

function parseCliArgs(args: readonly string[]): ParseResult {
  const inputArgs: string[] = [];
  const errors: string[] = [];
  let format: OutputFormat = DEFAULT_FORMAT;
  let minScore = DEFAULT_MIN_SCORE;
  let maxContributors = DEFAULT_MAX_CONTRIBUTORS;
  let maxRepos: number | undefined;
  let cacheEnabled = true;
  let cacheTtlSeconds = DEFAULT_CACHE_TTL_SECONDS;
  let clearCache = false;
  let help = false;
  let version = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--version" || arg === "-v") {
      version = true;
      continue;
    }

    if (arg === "--no-cache") {
      cacheEnabled = false;
      continue;
    }

    if (arg === "--clear-cache") {
      clearCache = true;
      continue;
    }

    if (arg === "--format") {
      const value = readFlagValue(args, index, arg, errors);
      if (value !== undefined) {
        if (value === "json" || value === "csv") {
          format = value;
        } else {
          errors.push(`Invalid --format value: ${value}. Expected json or csv.`);
        }
        index += 1;
      }
      continue;
    }

    if (arg === "--file") {
      const value = readFlagValue(args, index, arg, errors);
      if (value !== undefined) {
        inputArgs.push(arg, value);
        index += 1;
      }
      continue;
    }

    if (arg === "--min-score") {
      const value = readFlagValue(args, index, arg, errors);
      if (value !== undefined) {
        const parsed = parseNumberFlag(value, arg, { allowZero: true, integer: false });
        if (typeof parsed === "string") {
          errors.push(parsed);
        } else {
          minScore = parsed;
        }
        index += 1;
      }
      continue;
    }

    if (arg === "--max-contributors") {
      const value = readFlagValue(args, index, arg, errors);
      if (value !== undefined) {
        const parsed = parseNumberFlag(value, arg, { allowZero: false, integer: true });
        if (typeof parsed === "string") {
          errors.push(parsed);
        } else {
          maxContributors = parsed;
        }
        index += 1;
      }
      continue;
    }

    if (arg === "--cache-ttl") {
      const value = readFlagValue(args, index, arg, errors);
      if (value !== undefined) {
        const parsed = parseNumberFlag(value, arg, { allowZero: true, integer: true });
        if (typeof parsed === "string") {
          errors.push(parsed);
        } else {
          cacheTtlSeconds = parsed;
        }
        index += 1;
      }
      continue;
    }

    if (arg === "--max-repos") {
      const value = readFlagValue(args, index, arg, errors);
      if (value !== undefined) {
        const parsed = parseNumberFlag(value, arg, { allowZero: false, integer: true });
        if (typeof parsed === "string") {
          errors.push(parsed);
        } else {
          maxRepos = parsed;
        }
        index += 1;
      }
      continue;
    }

    if (arg.startsWith("--")) {
      errors.push(`Unknown option: ${arg}`);
      continue;
    }

    inputArgs.push(arg);
  }

  if (errors.length > 0) {
    return { errors };
  }

  return { args: { inputArgs, format, minScore, maxContributors, maxRepos, cacheEnabled, cacheTtlSeconds, clearCache, help, version } };
}

function readFlagValue(args: readonly string[], index: number, flag: string, errors: string[]): string | undefined {
  const value = args[index + 1];

  if (value === undefined || value.trim().length === 0 || value.startsWith("--")) {
    errors.push(`Missing value for ${flag}.`);
    return undefined;
  }

  return value;
}

function parseNumberFlag(value: string, flag: string, options: { allowZero: boolean; integer: boolean }): number | string {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || (options.integer && !Number.isInteger(parsed)) || parsed < 0 || (!options.allowZero && parsed === 0)) {
    const lowerBound = options.allowZero ? "0 or greater" : "1 or greater";
    const kind = options.integer ? "integer" : "number";
    return `Invalid ${flag} value: ${value}. Expected a finite ${kind} ${lowerBound}.`;
  }

  return parsed;
}

function writeErrors(writers: CliWriters, errors: readonly string[]): void {
  for (const error of errors) {
    writers.stderr(error);
  }
}

function writeWarnings(writers: CliWriters, warnings: readonly ScanWarning[]): void {
  for (const warning of warnings) {
    writers.stderr(formatWarning(warning));
  }
}

function formatWarning(warning: ScanWarning): string {
  const details = [warning.input, warning.repository, warning.contributor].filter((value) => value !== undefined).join(" ");
  const retry = warning.retryAfterSeconds === undefined ? "" : ` retry-after=${warning.retryAfterSeconds}s`;
  const suffix = details.length === 0 ? retry : ` (${details})${retry}`;
  return `${warning.code}: ${warning.message}${suffix}`;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
