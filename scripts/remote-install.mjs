/*
 * Add the plugin's loader row to a profile patch on another machine.
 *
 *   ssh <host> "node - <profile-dir>" < scripts/remote-install.mjs
 *
 * Idempotent, backs up the patch once, and drops a lone `[]` document before
 * appending block entries (an empty flow sequence cannot be followed by them).
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node - <profile-dir>');
  process.exit(2);
}
const file = path.join(dir, 'cordis.patch.yml');
let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

if (/^[ \t]*-[ \t]*id:[ \t]*['"]?peak-billing['"]?[ \t]*$/m.test(text)) {
  console.log(JSON.stringify({ ok: true, changed: false, file }));
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
if (text.length > 0) fs.writeFileSync(`${file}.bak-${stamp}`, text);

const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '[]');
text = lines.join('\n');
if (text.length > 0 && !text.endsWith('\n')) text += '\n';
text += "\n- insert:\n    - id: peak-billing\n      name: 'dsh-peak-billing'\n";
fs.writeFileSync(file, text);
console.log(JSON.stringify({ ok: true, changed: true, file, backup: `${file}.bak-${stamp}` }));
