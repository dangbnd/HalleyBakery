const { spawn } = require("child_process");
const path = require("path");

const port = String(process.env.PORT || 5173);
const host = process.env.HOST || "0.0.0.0";
const viteBin = path.join(process.cwd(), "node_modules", "vite", "bin", "vite.js");

const child = spawn(
  process.execPath,
  [viteBin, "--port", port, "--host", host],
  { stdio: "inherit", env: process.env }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
