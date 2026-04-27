import { parseArgs, printHelp, printVersion } from "./cli.js";
import { runExtract } from "./commands/extract.js";
import { runList } from "./commands/list.js";
import { runSummary } from "./commands/summary.js";
import { runContext } from "./commands/context.js";
import { runInit } from "./commands/init.js";
import { runSearch } from "./commands/search.js";
import { runRecall } from "./commands/recall.js";
import { runRules } from "./commands/rules.js";
import { runResolve } from "./commands/resolve.js";
import { runReindex } from "./commands/reindex.js";
import { runWatch } from "./commands/watch.js";
import { runDashboard } from "./commands/dashboard.js";
import { runExport } from "./commands/export.js";
import { runImport } from "./commands/import.js";
import { runDoctor } from "./commands/doctor.js";
import { runTry } from "./commands/try.js";
import { runLink } from "./commands/link.js";
import { startMcpServer } from "./mcp/server.js";
import { printError } from "./output/terminal.js";

// Node 22+ emits ExperimentalWarning when `node:sqlite` is loaded.
// We use it behind a feature-detected dynamic import for richer conversation
// titles; suppress just this one warning so `npx ai-memory-cli ...` stays clean.
const origEmitWarning = process.emitWarning.bind(process);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process as any).emitWarning = (warning: string | Error, ...rest: any[]): void => {
  const msg = typeof warning === "string" ? warning : warning?.message ?? "";
  const first = rest[0];
  const type =
    typeof first === "string"
      ? first
      : (first && typeof first === "object" && "type" in first
          ? (first as { type?: string }).type
          : undefined);
  if (
    (type === "ExperimentalWarning" || /ExperimentalWarning/i.test(msg)) &&
    /SQLite/i.test(msg)
  ) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (origEmitWarning as any)(warning, ...rest);
};

function run(p: Promise<number>): void {
  p.then((code) => { process.exitCode = code; }).catch((err) => {
    printError(String(err));
    process.exitCode = 1;
  });
}

const opts = parseArgs(process.argv.slice(2));

switch (opts.command) {
  case "help":
    printHelp();
    break;
  case "version":
    printVersion();
    break;
  case "list":
    run(runList(opts));
    break;
  case "extract":
    run(runExtract(opts));
    break;
  case "summary":
    run(runSummary(opts));
    break;
  case "context":
    run(runContext(opts));
    break;
  case "init":
    run(runInit(opts));
    break;
  case "search":
    run(runSearch(opts));
    break;
  case "recall":
    run(runRecall(opts));
    break;
  case "rules":
    run(runRules(opts));
    break;
  case "resolve":
    run(runResolve(opts));
    break;
  case "reindex":
    run(runReindex(opts));
    break;
  case "watch":
    run(runWatch(opts));
    break;
  case "dashboard":
    run(runDashboard(opts));
    break;
  case "export":
    run(runExport(opts));
    break;
  case "import":
    run(runImport(opts));
    break;
  case "doctor":
    run(runDoctor(opts));
    break;
  case "try":
    run(runTry(opts));
    break;
  case "link":
    run(runLink(opts));
    break;
  case "serve":
    startMcpServer(opts.debug ?? false).catch((err) => {
      printError(`MCP server failed: ${err}`);
      process.exitCode = 1;
    });
    break;
  default:
    printError(`Unknown command. Run "ai-memory --help" for usage.`);
    process.exitCode = 1;
}
