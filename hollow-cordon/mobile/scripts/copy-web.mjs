// Copies the web game (one folder up) into www/, the folder Capacitor packages into the app.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const here = path.dirname(fileURLToPath(import.meta.url));
const game = path.resolve(here, '..', '..');
const www = path.resolve(here, '..', 'www');
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest']) fs.copyFileSync(path.join(game, f), path.join(www, f));
// lock the packaged page down: it may only load its own bundled files and never talk to the network
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none'";
const idx = path.join(www, 'index.html');
fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${CSP}">`));
for (const d of ['css', 'js', 'icons']) fs.cpSync(path.join(game, d), path.join(www, d), { recursive: true });
let n = 0; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) e.isDirectory() ? walk(path.join(d, e.name)) : n++; }; walk(www);
console.log(`copied the game into ${path.relative(process.cwd(), www) || 'www'} (${n} files)`);
