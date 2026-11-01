const { execSync } = require('child_process');
const xml = execSync('adb -s 192.168.0.191:46543 shell cat /sdcard/dump.xml').toString('utf8');
const regex = /text="([^"]*)"[^>]*bounds="([^"]*)"/g;
let m;
while ((m = regex.exec(xml)) !== null) {
  if (m[1]) console.log(`${m[1]} --> ${m[2]}`);
}
