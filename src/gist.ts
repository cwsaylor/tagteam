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
      `gh gist create --private --filename "${filename}" -`,
      { input: content, stdio: ["pipe", "pipe", "ignore"] }
    );
    return result.toString().trim();
  } catch {
    throw new Error("Failed to create gist.");
  }
}
