import { execSync } from "node:child_process";

export function copyToClipboard(text: string): void {
  const platform = process.platform;

  let cmd: string;
  if (platform === "darwin") {
    cmd = "pbcopy";
  } else if (platform === "win32") {
    cmd = "clip";
  } else {
    // Linux — try xclip first, fall back to xsel
    try {
      execSync("which xclip", { stdio: "ignore" });
      cmd = "xclip -selection clipboard";
    } catch {
      cmd = "xsel --clipboard --input";
    }
  }

  execSync(cmd, { input: text, stdio: ["pipe", "ignore", "ignore"] });
}
