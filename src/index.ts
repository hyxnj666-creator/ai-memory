import { parseArgs, printHelp, printVersion } from "./cli.js";
import { runExtract } from "./commands/extract.js";
import { runList } from "./commands/list.js";
import { runSummary } from "./commands/summary.js";
import { runContext } from "./commands/context.js";
import { runInit } from "./commands/init.js";
import { runSearch } from "./commands/search.js";
import { runRules } from "./commands/rules.js";
import { runResolve } from "./commands/resolve.js";
import { runReindex } from "./commands/reindex.js";
import { runWatch } from "./commands/watch.js";
import { startMcpServer } from "./mcp/server.js";
import { printError } from "./output/terminal.js";

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
