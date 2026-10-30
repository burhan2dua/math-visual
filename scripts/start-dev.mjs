import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, watch } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templatesRoot = resolve(projectRoot, "src", "templates");
const runGenerator = () => {
  const result = spawnSync(
    process.execPath,
    [resolve(projectRoot, "scripts", "generate-template-registry.mjs")],
    { cwd: projectRoot, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Template registry generation failed with exit code ${result.status}.`,
    );
  }
};

const findAvailablePort = async (start) => {
  for (let port = start; port < start + 100; port++) {
    const available = await new Promise((resolvePort, reject) => {
      const server = createServer();
      server.once("error", (error) => {
        if (error.code === "EADDRINUSE") {
          resolvePort(false);
          return;
        }
        reject(error);
      });
      server.listen(port, () => {
        server.close((error) => {
          if (error) reject(error);
          else resolvePort(true);
        });
      });
    });
    if (available) return port;
  }

  throw new Error(`Could not find an available port starting at ${start}.`);
};

const packageBin = (packagePath, command) => {
  const manifestPath = resolve(projectRoot, "node_modules", packagePath, "package.json");
  if (!existsSync(manifestPath)) return "";
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const relativeBin =
    typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[command];
  return relativeBin ? resolve(dirname(manifestPath), relativeBin) : "";
};

const viteBin = packageBin("vite", "vite");
const remotionBin = packageBin("@remotion/cli", "remotion");

if (!existsSync(viteBin) || !existsSync(remotionBin)) {
  throw new Error("Project dependencies are missing. Run npm install first.");
}

runGenerator();
const [vitePort, studioPort] = await Promise.all([
  findAvailablePort(5173),
  findAvailablePort(3000),
]);

const children = new Set();
let stopping = false;
let exitCode = 0;
let regenerateTimer;
let forceKillTimer;
let watcher;

const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  clearTimeout(regenerateTimer);
  watcher?.close();
  for (const child of children) child.kill();
  forceKillTimer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 4000);
  forceKillTimer.unref();
  if (children.size === 0) {
    clearTimeout(forceKillTimer);
    process.exitCode = exitCode;
  }
};

const startChild = (label, executable, args) => {
  const child = spawn(process.execPath, [executable, ...args], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  children.add(child);
  child.on("error", (error) => {
    console.error(`${label} failed to start:`, error);
    stop(1);
  });
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!stopping) {
      console.error(
        `${label} stopped${signal ? ` (${signal})` : ` with exit code ${code}`}.`,
      );
      stop(code ?? 1);
    }
    if (stopping && children.size === 0) {
      clearTimeout(forceKillTimer);
      process.exitCode = exitCode;
    }
  });
};

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

watcher = watch(templatesRoot, { recursive: true });
watcher.on("error", (error) => {
  console.error("Could not watch template folders:", error);
  stop(1);
});
watcher.on("change", () => {
  clearTimeout(regenerateTimer);
  regenerateTimer = setTimeout(() => {
    try {
      runGenerator();
    } catch (error) {
      console.error("Template registry update failed:", error);
    }
  }, 150);
});

startChild("Vite preview", viteBin, [
  "--host",
  "0.0.0.0",
  "--port",
  String(vitePort),
  "--strictPort",
]);
startChild("Remotion Studio", remotionBin, [
  "studio",
  "src/remotion/index.ts",
  "--port",
  String(studioPort),
  "--no-open",
  "--force-new",
]);
console.log(`Preview: http://localhost:${vitePort}`);
console.log(`Remotion Studio: http://localhost:${studioPort}`);
