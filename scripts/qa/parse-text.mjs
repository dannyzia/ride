import fs from 'fs';
const d = process.argv[2];
const p = fs.readFileSync(process.env.TEMP + '/kilo/' + d + '.xml', 'utf8');
const texts = [...p.matchAll(/text="([^"]{2,})"/g)].map(m => m[1]);
console.log(texts.join(' | '));
