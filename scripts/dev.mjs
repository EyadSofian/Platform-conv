import { spawn } from "node:child_process";

const runner = process.platform === "win32" ? "npx.cmd" : "npx";
const children = [
  spawn(runner, ["next", "dev"], { stdio: "inherit", shell: false }),
  spawn(runner, ["tsx", "socket-server.ts"], { stdio: "inherit", shell: false }),
];

function shutdown(signal) {
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shutdown(signal);
    process.exit(0);
  });
}

children.forEach((child) => {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown("SIGTERM");
      process.exit(code);
    }
  });
});
