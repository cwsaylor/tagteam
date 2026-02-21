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
    let hasXclip = false;
    let hasXsel = false;
    try {
      execSync("which xclip", { stdio: "ignore" });
      hasXclip = true;
    } catch {}
    if (!hasXclip) {
      try {
        execSync("which xsel", { stdio: "ignore" });
        hasXsel = true;
      } catch {}
    }

    if (hasXclip) {
      cmd = "xclip -selection clipboard";
    } else if (hasXsel) {
      cmd = "xsel --clipboard --input";
    } else {
      throw new Error(
        "Clipboard requires xclip or xsel. Install one with: sudo apt install xclip"
      );
    }
  }

  try {
    execSync(cmd, { input: text, stdio: ["pipe", "ignore", "ignore"] });
  } catch {
    throw new Error(
      `Failed to copy to clipboard using "${cmd.split(" ")[0]}". Check that it is installed and working.`
    );
  }
}
