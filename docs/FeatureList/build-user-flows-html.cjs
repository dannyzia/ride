#!/usr/bin/env node
/* build-user-flows-html.cjs — regenerate docs/FeatureList/USER-FLOWS.html from
 * docs/FeatureList/USER-FLOWS.md. Parses "### F-NN · title" sections and their
 * ```mermaid blocks; emits the self-contained dark viewer. Idempotent.
 */
const fs = require("fs");
const path = require("path");

const dir = __dirname;
const md = fs.readFileSync(path.join(dir, "USER-FLOWS.md"), "utf8");
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Parse sections: "### F-NN · Title" ... ```mermaid fenced blocks
const sections = [];
const lines = md.split(/\r?\n/);
let cur = null;
let inCode = false;
let codeBuf = [];
for (const raw of lines) {
  const line = raw.replace(/\r$/, "");
  const h = line.match(/^###\s+(F-\d+\s*·\s*[^*(]+?)(\s*\([^)]*\))?\s*$/);
  if (h && !inCode) {
    if (cur) sections.push(cur);
    cur = { id: slug(h[1].split("·")[0]), title: h[1].trim(), diagrams: [] };
    continue;
  }
  if (!cur) continue;
  if (!inCode && /^```mermaid\s*$/.test(line)) { inCode = true; codeBuf = []; continue; }
  if (inCode && /^```\s*$/.test(line)) { inCode = false; cur.diagrams.push(codeBuf.join("\n")); continue; }
  if (inCode) codeBuf.push(line);
}
if (cur) sections.push(cur);

const nav = sections.map((s) => `<a href="#${s.id}">${esc(s.title)}</a>`).join("\n      ");
const body = sections.map((s) => {
  const diagrams = s.diagrams.map((d) => `<pre class="mermaid">\n${esc(d)}\n</pre>`).join("\n");
  return `<section class="card" id="${s.id}"><h3>${esc(s.title)}</h3>${diagrams}\n</section>`;
}).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ride — User Flows &amp; Workflows (Full Library)</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<script>
  mermaid.initialize({
    startOnLoad: true,
    theme: "dark",
    securityLevel: "loose",
    fontFamily: "Segoe UI, system-ui, sans-serif",
    themeVariables: {
      primaryColor: "#1c2740", primaryTextColor: "#e8eefc", primaryBorderColor: "#4f7cff",
      lineColor: "#7fa4ff", secondaryColor: "#152238", tertiaryColor: "#101828",
      noteBkgColor: "#2b2410", noteTextColor: "#ffe9a8", noteBorderColor: "#8a6d1a",
      actorBkg: "#1c2740", actorBorder: "#4f7cff", actorTextColor: "#e8eefc",
      signalColor: "#c9d8f5", signalTextColor: "#c9d8f5"
    },
    flowchart: { curve: "basis", htmlLabels: true }
  });
</script>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0b0f17; color: #dbe4f5; font-family: "Segoe UI", system-ui, sans-serif; }
  a { color: #7fa4ff; text-decoration: none; }
  .layout { display: grid; grid-template-columns: 280px 1fr; min-height: 100vh; }
  nav { position: sticky; top: 0; align-self: start; max-height: 100vh; overflow-y: auto; padding: 18px 14px; background: #0e1420; border-right: 1px solid #1d2a44; }
  nav h1 { font-size: 15px; margin: 0 0 12px; color: #e8eefc; }
  nav .group { margin: 14px 0 4px; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: #6d84b4; }
  nav a { display: block; padding: 6px 8px; border-radius: 8px; font-size: 12.5px; line-height: 1.35; margin-bottom: 2px; }
  nav a:hover { background: #16203a; }
  main { padding: 26px 34px 80px; max-width: 1100px; }
  header.top { margin-bottom: 26px; }
  header.top h2 { margin: 0 0 6px; font-size: 22px; color: #e8eefc; }
  header.top p { margin: 0; color: #8ea3c8; font-size: 13px; }
  .banner { background: #241a06; border: 1px solid #6b5416; color: #ffd98a; padding: 10px 14px; border-radius: 10px; font-size: 12.5px; margin-bottom: 8px; }
  section.card { background: #0f1626; border: 1px solid #1d2a44; border-radius: 14px; padding: 20px 22px 26px; margin: 0 0 26px; }
  section.card h3 { margin: 0 0 4px; font-size: 16px; color: #e8eefc; }
  section.card .meta { color: #7d92ba; font-size: 12px; margin-bottom: 14px; }
  .mermaid { background: #0b1120; border: 1px solid #182238; border-radius: 10px; padding: 16px; display: flex; justify-content: center; overflow-x: auto; }
  code { background: #131c30; padding: 1px 6px; border-radius: 6px; font-size: 12px; color: #9fc1ff; }
</style>
</head>
<body>
<div class="layout">
<nav>
  <h1>Ride — User Flows</h1>
      ${nav}
</nav>
<main>
<header class="top">
  <h2>Ride — User Flows &amp; Workflows</h2>
  <p>Full library · ${sections.length} diagrams · all personas · mirrors <code>docs/Plan/27-SHOP-FLEET-STAFF-DELIVERY-SURFACES-PLAN.md</code> + <code>docs/FeatureList/FEATURES.md</code> · source: <code>docs/FeatureList/USER-FLOWS.md</code> · regenerate: <code>node docs/FeatureList/build-user-flows-html.cjs</code></p>
</header>
<div class="banner">Rendered via Mermaid CDN — first view needs internet. 💤 = descoped by owner ruling (payments — COD launch). 🔨 = in development (Plan 27).</div>
${body}
</main>
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(dir, "USER-FLOWS.html"), html, "utf8");
console.log(`USER-FLOWS.html regenerated — ${sections.length} sections, ${sections.reduce((n, s) => n + s.diagrams.length, 0)} diagrams.`);
