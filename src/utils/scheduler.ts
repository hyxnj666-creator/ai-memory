/**
 * Cross-platform local scheduler for `ai-memory init --schedule`.
 *
 * Platform dispatch:
 *   macOS  → launchd plist at ~/Library/LaunchAgents/
 *   Linux  → user crontab via `crontab -l | { cat; echo ...; } | crontab -`
 *   Windows → Task Scheduler via `schtasks /create`
 *
 * All three targets run `npx ai-memory-cli extract --incremental` once per
 * day (09:00 local time) inside the project directory that called `init`.
 *
 * Design constraints:
 *   - No new runtime deps — uses only node:child_process and node:fs.
 *   - Idempotent: calling scheduleExtract twice does not create duplicates.
 *   - `unscheduleExtract` is the exact inverse and cleans up completely.
 */

import { execFile as _execFile } from "node:child_process";
import { writeFile, unlink, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";

const execFile = promisify(_execFile);
const TIMEOUT = 10_000;

export type Platform = "darwin" | "linux" | "win32";

export interface ScheduleResult {
  platform: Platform;
  method: "launchd" | "crontab" | "schtasks";
  action: "created" | "already-exists" | "updated";
  /** Human-readable description of where the task was registered. */
  target: string;
}

// ---------- Label used as a stable identifier across all platforms ----------

function makeLabel(projectDir: string): string {
  // Stable slug derived from the absolute project path so each project gets
  // its own scheduled task. Replace non-alphanumeric with dots (launchd style).
  const slug = projectDir
    .replace(/^[A-Za-z]:[\\/]/, "") // strip Windows drive letter
    .replace(/[\\/]/g, ".")
    .replace(/[^a-zA-Z0-9.]/g, "")
    .slice(0, 60)
    .replace(/\.+$/, "");
  return `com.ai-memory-cli.extract.${slug}`;
}

// ---------- macOS launchd ----------

function plistPath(label: string): string {
  return join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
}

function buildPlist(label: string, projectDir: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/sh</string>
        <string>-c</string>
        <string>cd ${projectDir} &amp;&amp; npx ai-memory-cli extract --incremental</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>9</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>RunAtLoad</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${join(projectDir, ".ai-memory", "schedule.log")}</string>
    <key>StandardErrorPath</key>
    <string>${join(projectDir, ".ai-memory", "schedule.log")}</string>
</dict>
</plist>`;
}

async function scheduleLaunchd(projectDir: string): Promise<ScheduleResult> {
  const label = makeLabel(projectDir);
  const path = plistPath(label);

  let existingContent: string | null = null;
  try { existingContent = await readFile(path, "utf-8"); } catch { /* new */ }

  const content = buildPlist(label, projectDir);
  if (existingContent === content) {
    return { platform: "darwin", method: "launchd", action: "already-exists", target: path };
  }

  // If plist already exists but differs, unload first before overwriting
  if (existingContent !== null) {
    try { await execFile("launchctl", ["unload", path], { timeout: TIMEOUT }); } catch { /* ok */ }
  }

  await writeFile(path, content, "utf-8");

  try {
    await execFile("launchctl", ["load", path], { timeout: TIMEOUT });
  } catch {
    // launchctl may fail on older macOS or restricted environments; the plist
    // is still written and will be picked up on next login.
  }

  return {
    platform: "darwin",
    method: "launchd",
    action: existingContent === null ? "created" : "updated",
    target: path,
  };
}

async function unscheduleLaunchd(projectDir: string): Promise<void> {
  const label = makeLabel(projectDir);
  const path = plistPath(label);
  try { await execFile("launchctl", ["unload", path], { timeout: TIMEOUT }); } catch { /* ok */ }
  try { await unlink(path); } catch { /* ok if already gone */ }
}

// ---------- Linux crontab ----------

const CRON_MARKER_PREFIX = "# ai-memory-cli:";

function cronLine(projectDir: string, marker: string): string {
  return `0 9 * * * cd ${projectDir} && npx ai-memory-cli extract --incremental ${marker}`;
}

async function readCrontab(): Promise<string> {
  try {
    const r = await execFile("crontab", ["-l"], { timeout: TIMEOUT });
    return r.stdout;
  } catch {
    return ""; // no crontab installed is not an error
  }
}

async function writeCrontab(content: string): Promise<void> {
  const { exec } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const proc = exec("crontab -", (err) => (err ? reject(err) : resolve()));
    proc.stdin?.end(content);
  });
}

async function scheduleCron(projectDir: string): Promise<ScheduleResult> {
  const label = makeLabel(projectDir);
  const marker = `${CRON_MARKER_PREFIX}${label}`;
  const line = cronLine(projectDir, marker);

  const current = await readCrontab();
  if (current.includes(marker)) {
    return { platform: "linux", method: "crontab", action: "already-exists", target: "user crontab" };
  }

  const newContent = current.trimEnd() + "\n" + line + "\n";
  await writeCrontab(newContent);
  return { platform: "linux", method: "crontab", action: "created", target: "user crontab" };
}

async function unscheduleCron(projectDir: string): Promise<void> {
  const label = makeLabel(projectDir);
  const marker = `${CRON_MARKER_PREFIX}${label}`;

  const current = await readCrontab();
  if (!current.includes(marker)) return;

  const filtered = current
    .split("\n")
    .filter((l) => !l.includes(marker))
    .join("\n");
  await writeCrontab(filtered);
}

// ---------- Windows Task Scheduler ----------

function taskName(projectDir: string): string {
  return `ai-memory-cli-extract-${makeLabel(projectDir).slice(-40)}`;
}

async function scheduleSchtasks(projectDir: string): Promise<ScheduleResult> {
  const name = taskName(projectDir);

  // Check if task already exists
  try {
    await execFile("schtasks", ["/query", "/tn", name], { timeout: TIMEOUT });
    return { platform: "win32", method: "schtasks", action: "already-exists", target: `Task Scheduler: ${name}` };
  } catch { /* doesn't exist yet */ }

  const cmd = `cmd /c "cd /d ${projectDir} && npx ai-memory-cli extract --incremental"`;
  await execFile(
    "schtasks",
    [
      "/create",
      "/tn", name,
      "/tr", cmd,
      "/sc", "daily",
      "/st", "09:00",
      "/f",
    ],
    { timeout: TIMEOUT }
  );

  return { platform: "win32", method: "schtasks", action: "created", target: `Task Scheduler: ${name}` };
}

async function unscheduleSchtasks(projectDir: string): Promise<void> {
  const name = taskName(projectDir);
  try {
    await execFile("schtasks", ["/delete", "/tn", name, "/f"], { timeout: TIMEOUT });
  } catch { /* ok if not found */ }
}

// ---------- Public API ----------

/**
 * Register a daily `extract --incremental` run for `projectDir` using the
 * platform-native scheduler. Returns a result descriptor; never throws.
 */
export async function scheduleExtract(
  projectDir?: string
): Promise<ScheduleResult | { error: string }> {
  const cwd = projectDir ? resolve(projectDir) : resolve(".");
  const platform = process.platform as Platform;

  try {
    if (platform === "darwin") return await scheduleLaunchd(cwd);
    if (platform === "linux") return await scheduleCron(cwd);
    if (platform === "win32") return await scheduleSchtasks(cwd);
    return { error: `Unsupported platform: ${platform}` };
  } catch (err) {
    return { error: String(err) };
  }
}

/**
 * Remove the scheduled task created by `scheduleExtract`. No-ops if not found.
 */
export async function unscheduleExtract(projectDir?: string): Promise<void> {
  const cwd = projectDir ? resolve(projectDir) : resolve(".");
  const platform = process.platform as Platform;

  if (platform === "darwin") await unscheduleLaunchd(cwd);
  else if (platform === "linux") await unscheduleCron(cwd);
  else if (platform === "win32") await unscheduleSchtasks(cwd);
}
