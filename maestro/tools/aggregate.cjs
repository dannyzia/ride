// Aggregate route-inventory.json into per-vertical coverage stats for the manifest.
const fs = require('fs');
const path = require('path');
const inv = JSON.parse(fs.readFileSync(path.join(__dirname, 'route-inventory.json'), 'utf8'));

const VERTICALS = [
  { key: 'auth', match: /^app\/\(auth\)|^app\/index|^app\/payment/ },
  { key: 'rider-v1', match: /^app\/\(main\)\/\(customer\)/ },
  { key: 'driver-v1', match: /^app\/\(main\)\/\(rider\)/ },
  { key: 'fleet', match: /^app\/\(main\)\/\(fleet\)/ },
  { key: 'shops', match: /\(shops\)/ },
  { key: 'rental-v2-v5', match: /\(rental-marketplace\)|\(rental-bidder\)/ },
  { key: 'delivery-v6', match: /\(delivery\)/ },
  { key: 'ambulance-v7', match: /\(ambulance\)|ambulance-cert|ambulance-driver/ },
  { key: 'admin', match: /^app\/admin/ },
];

function verticalOf(file) {
  for (const v of VERTICALS) if (v.match.test(file)) return v.key;
  return 'other';
}

const byVertical = {};
const byClass = { AUTOMATABLE: 0, 'COUNTERPART-API': 0, BLOCKED: 0, 'READ-ONLY': 0 };
for (const s of inv.screens) {
  const v = verticalOf(s.file);
  byVertical[v] = byVertical[v] || { screens: 0, elements: 0, handlers: 0, classes: {} };
  byVertical[v].screens++;
  byVertical[v].elements += s.elements.length;
  byVertical[v].handlers += s.handlers.length;
  for (const h of s.handlers) {
    byClass[h.class] = (byClass[h.class] || 0) + 1;
    byVertical[v].classes[h.class] = (byVertical[v].classes[h.class] || 0) + 1;
  }
}
console.log(JSON.stringify({ routeFiles: inv.routeFiles, interactiveComponents: inv.interactiveComponents, handlerAnchors: inv.handlerAnchors, byVertical, byClass }, null, 2));
