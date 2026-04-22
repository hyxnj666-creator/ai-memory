import type { CliOptions } from "../types.js";
import { startDashboard } from "../dashboard/server.js";
import { c } from "../output/terminal.js";

export async function runDashboard(opts: CliOptions): Promise<number> {
  const port = opts.port ?? 3141;

  console.log(
    `\n${c.bold("ai-memory dashboard")} ${c.dim("— local web UI")}\n`
  );

  try {
    await startDashboard(port);
    return 0;
  } catch {
    return 1;
  }
}
