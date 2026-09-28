// Phase 0 manifest builder — walks app/ route files and extracts interactive
// element anchors (file:line) for the Maestro coverage manifest.
// Excludes +api/+html/tests (same filter chain as lib/__tests__/router-route-defaults.test.ts).
const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..', '..', 'app');
const OUT_JSON = path.resolve(__dirname, 'route-inventory.json');

const EXTS = new Set(['.ts', '.tsx']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (EXTS.has(path.extname(entry.name))) out.push(p);
  }
  return out;
}

// ── Inline flow-builder heuristics (plain regex, no deps) ────────────────────
const FLOWS = [
  { re: /^\s*(?:const|let)?\s*\w*tab\w*\s*=\s*\[\s*$/, kind: 'tab' },       // tab arrays
  { re: /(?:home|inbox|rides|wallet|profile|earning|activity|dashboard|operations|more|hotspot|finance|trips|settings|menu|explore|orders)(?:['"]\s*:|\s*\?)/i, kind: 'tab-or-nav' },
  { re: /openURL|Linking\.open|tel:|mailto:|sms:/i, kind: 'external' },      // dialer/URL
  { re: /Alert\.alert|showToast|toast\./i, kind: 'dialog-toast' },
  { re: /router\.(push|replace|navigate|back)|router\.dismiss/i, kind: 'navigation' },
];
const TAG_BLOCKED = /portpos|PaymentWebView|payNow|checkout|top.?up|purchase|payment/i;
const TAG_COUNTERPART = /bid|accept|quote|rfq|mark.?ready|award|fleet.?ack|courier|broadcast/i;
const TAG_READONLY = /faq|terms|privacy|policy|legal|view.?only|receipt|statement/i;

function classify(rel, kind, lineText) {
  if (TAG_BLOCKED.test(lineText) || TAG_BLOCKED.test(rel)) return 'BLOCKED';
  if (TAG_COUNTERPART.test(lineText)) return 'COUNTERPART-API';
  if (TAG_READONLY.test(lineText) && kind === 'tab-or-nav') return 'READ-ONLY';
  return 'AUTOMATABLE';
}

function isInteractive(lineText) {
  return /onPress|onChangeText|onValueChange|onSubmitEditing|onEndEditing|onFocus|onBlur|onCheckChange|onToggle|onRefresh|onScroll|onSnapToItem|onIndexChange|onValueChange|onSlidingComplete|onDateChange|onTimeChange|onChange=/.test(lineText);
}

function guessKind(lineText, prevLineText) {
  const combined = (prevLineText || '') + '\n' + lineText;
  for (const f of FLOWS) if (f.re.test(combined)) return f.kind;
  return 'generic';
}

function scanFile(absPath) {
  const rel = path.relative(path.resolve(__dirname, '..', '..'), absPath).split(path.sep).join('/');
  const src = fs.readFileSync(absPath, 'utf8');
  const lines = src.split(/\r?\n/);
  const elements = [];
  const handlers = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    // Interactive JSX component openers
    const compMatch = line.match(/<(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|Button|TextInput|Switch|Checkbox|Chip)\b/);
    if (compMatch) {
      elements.push({
        line: lineNo,
        type: compMatch[1],
        // capture testID, accessibilityLabel, or a text hint if on same line
        testID: (line.match(/testID="([^"]*)"/) || [])[1] || null,
        a11y: (line.match(/accessibilityLabel="([^"]*)"/) || [])[1] || null,
        text: (line.match(/(?:title|label|placeholder)\s*[:=]\s*["'`]([^"'`]{2,40})["'`]/) || [])[1] || null,
      });
    }
    // handler lines (onPress={...} / onChangeText={...})
    if (isInteractive(line)) {
      const handlerKinds = new Set();
      if (/onPress/.test(line)) handlerKinds.add('onPress');
      if (/onChangeText|onValueChange|onSubmitEditing|onEndEditing|onDateChange|onTimeChange|onChange=/.test(line)) handlerKinds.add('input');
      if (/onToggle|onCheckChange/.test(line)) handlerKinds.add('toggle');
      if (/onFocus|onBlur/.test(line)) handlerKinds.add('focus');
      if (/onRefresh/.test(line)) handlerKinds.add('refresh');
      if (/onScroll/.test(line)) handlerKinds.add('scroll');
      const kind = guessKind(line, lines[i - 1]);
      const isInput = [...handlerKinds].some(h => h !== 'onPress');
      handlers.push({
        line: lineNo,
        kinds: [...handlerKinds],
        kind: isInput ? 'input-or-toggle' : kind,
        class: classify(rel, kind, line),
      });
    }
  }
  // component-level: default export? (route files must have one)
  const hasDefaultExport = /^\s*export\s+default\b/m.test(src) || /^\s*export\s*\{[^}]*\bas\s+default\b/m.test(src);
  return { file: rel, defaultExport: hasDefaultExport, elements, handlers };
}

function main() {
  const files = walk(APP).filter(f => {
    const rel = path.relative(APP, f);
    if (/(\+api|\+html)/.test(rel)) return false;
    if (/(^|[\\/])__tests__([\\/]|$)/.test(rel)) return false;
    if (/\.test\.|\.spec\./.test(rel)) return false;
    return true;
  });
  const out = [];
  let elTotal = 0, hTotal = 0;
  for (const f of files.sort()) {
    const r = scanFile(f);
    elTotal += r.elements.length;
    hTotal += r.handlers.length;
    out.push(r);
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify({ scannedAt: new Date().toISOString(), routeFiles: files.length, interactiveComponents: elTotal, handlerAnchors: hTotal, screens: out }, null, 2));
  console.log(`scanned ${files.length} route files; ${elTotal} interactive components; ${hTotal} handler anchors -> ${path.basename(OUT_JSON)}`);
}

main();
