const { spawn } = require("child_process");
const { readFileSync, existsSync } = require("fs");
const { resolve } = require("path");

const cmd = process.argv[2]; // "dev" or "start"
if (!cmd || !["dev", "start"].includes(cmd)) {
  console.error('Usage: node scripts/server.js <dev|start>');
  process.exit(1);
}

// Read PORT from .env if not already set in environment
let port = process.env.PORT;
if (!port) {
  const envPath = resolve(__dirname, "..", ".env");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/^PORT\s*=\s*(\d+)/m);
    if (match) port = match[1];
  }
}
port = port || "3001";

const isWin = process.platform === "win32";
const nextCmd = isWin ? "next.cmd" : "next";
const args = [cmd, "-p", port];

const child = spawn(nextCmd, args, {
  stdio: "inherit",
  shell: true,
  cwd: resolve(__dirname, ".."),
});

child.on("exit", (code) => process.exit(code ?? 0));
