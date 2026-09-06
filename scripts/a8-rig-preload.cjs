/**
 * A8 rig preload — stubs utils-server/index.ts for the rig process ONLY.
 *
 * activationJobs.ts imports { sendToUser } from './index', but index.ts's
 * module scope runs startup() (H3 refresh, compensation worker, FULL
 * scheduler + WS listen). The rig must time job bodies in isolation, so this
 * preload patches Module._load to return a no-op Proxy for any resolve that
 * lands on utils-server/index.* — sendToUser becomes a no-op (no live WS in
 * the rig process anyway).
 *
 * Usage: node --require tsx/cjs --require ./scripts/a8-rig-preload.cjs ...
 * (see scripts/README.md)
 */
const Module = require("node:module");
const path = require("node:path");

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  try {
    if (
      (request === "./index" || request === "../index" || request === "./index.ts") &&
      parent &&
      parent.path &&
      parent.path.includes("utils-server")
    ) {
      const resolved = path.resolve(parent.path, request);
      if (/utils-server[\\/]index(\.(ts|js))?$/.test(resolved)) {
        return new Proxy({}, {
          get() {
            return () => undefined;
          },
        });
      }
    }
  } catch {
    // fall through to real loader
  }
  return origLoad.apply(this, arguments);
};
