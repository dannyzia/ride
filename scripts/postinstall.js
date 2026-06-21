// scripts/postinstall.js
//
// Single-entry postinstall hook. Runs everything that needs to happen after
// `npm install` from one Node process, so we don't depend on shell-specific
// chaining (cmd.exe vs bash) that npm uses to invoke scripts.
//
// Steps:
//   1. Apply patch-package patches (best-effort; logs warnings, never fails
//      the whole postinstall if a patch can't be applied).
//   2. Install local shims into node_modules/ (currently: react-native-worklets
//      shim that delegates to react-native-reanimated/plugin).

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

function log(...args) {
  console.log("[postinstall]", ...args);
}

// ---------------------------------------------------------------------------
// Step 1: patch-package (best-effort)
// ---------------------------------------------------------------------------
function applyPatches() {
  const patchesDir = path.join(projectRoot, "patches");
  if (!fs.existsSync(patchesDir)) {
    log("no patches/ directory, skipping patch-package");
    return;
  }
  const patchFiles = fs
    .readdirSync(patchesDir)
    .filter((f) => f.endsWith(".patch"));
  if (patchFiles.length === 0) {
    log("no .patch files in patches/, skipping patch-package");
    return;
  }

  const result = spawnSync("npx", ["--no-install", "patch-package"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    // Don't throw — patch failures should not break `npm install`.
    // The user will see the patch-package error output above.
    console.warn(
      "[postinstall] warning: patch-package exited with status",
      result.status,
      "(continuing)",
    );
  } else {
    log("patch-package applied successfully");
  }
}

// ---------------------------------------------------------------------------
// Step 2: install local shims into node_modules/
// ---------------------------------------------------------------------------
function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function installShim(name) {
  const sourceDir = path.join(projectRoot, "shims", name);
  const targetDir = path.join(projectRoot, "node_modules", name);

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`shim source not found: ${sourceDir}`);
  }

  // Always (re)write to guarantee correctness.
  fs.rmSync(targetDir, { recursive: true, force: true });
  copyRecursive(sourceDir, targetDir);
  log(`installed shim ${name} -> node_modules/${name}`);
}

function installShims() {
  const shimsDir = path.join(projectRoot, "shims");
  if (!fs.existsSync(shimsDir)) {
    log("no shims/ directory, skipping shim install");
    return;
  }
  for (const entry of fs.readdirSync(shimsDir)) {
    const entryPath = path.join(shimsDir, entry);
    if (fs.statSync(entryPath).isDirectory()) {
      installShim(entry);
    }
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
applyPatches();
installShims();
log("done");
