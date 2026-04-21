import { userInfo } from "node:os";
import type { AiMemoryConfig } from "../types.js";

function slugifyAuthor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

async function getGitUserName(): Promise<string | null> {
  try {
    const { execSync } = await import("node:child_process");
    const name = execSync("git config user.name", { encoding: "utf-8", timeout: 3000 }).trim();
    return name || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the current author identity.
 * Priority: CLI override > config.author > git config user.name > OS username
 */
export async function resolveAuthor(
  config: AiMemoryConfig,
  cliOverride?: string
): Promise<string> {
  if (cliOverride) return slugifyAuthor(cliOverride);
  if (config.author) return slugifyAuthor(config.author);

  const gitName = await getGitUserName();
  if (gitName) return slugifyAuthor(gitName);

  try {
    const osName = userInfo().username;
    if (osName) return slugifyAuthor(osName);
  } catch { /* container / restricted env */ }

  return "unknown";
}
