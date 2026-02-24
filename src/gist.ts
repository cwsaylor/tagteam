import { execSync } from "node:child_process";

export function createGist(content: string, filename: string): string {
  // Check gh is installed and authenticated
  try {
    execSync("gh auth status", { stdio: "ignore" });
  } catch {
    // Distinguish between not installed and not authenticated
    try {
      execSync("which gh", { stdio: "ignore" });
    } catch {
      throw new Error(
        "gh CLI not found. Install it from https://cli.github.com"
      );
    }
    throw new Error(
      "gh CLI is not authenticated. Run: gh auth login"
    );
  }

  try {
    const result = execSync(
      `gh gist create --filename "${filename}" -`,
      { input: content, stdio: ["pipe", "pipe", "pipe"], encoding: "utf-8" }
    );
    return result.trim();
  } catch (e: any) {
    const stderr = e.stderr?.toString().trim();
    throw new Error(stderr || "Failed to create gist.");
  }
}
