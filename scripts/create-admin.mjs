/* Creates the first administrator or resets an existing account's password. Usage: node scripts/create-admin.mjs <name> */
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {hashPassword,id,now} from '../server/core.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const name=process.argv[2];
if(!name||!/^[\p{L}\p{N}_-]{3,24}$/u.test(name)){console.error('Aufruf: node scripts/create-admin.mjs <Benutzername>');process.exit(1)}
const db=new DatabaseSync(path.join(process.env.MODCHECK_DATA?path.resolve(process.env.MODCHECK_DATA):path.join(root,'data'),'modcheck.sqlite'));
if(!db.prepare(`SELECT 1 FROM sqlite_master WHERE name='users'`).get()){console.error('Bitte starte ModCheck einmal, damit die Datenbank angelegt wird.');process.exit(1)}
const password=randomBytes(12).toString('base64url'),existing=db.prepare('SELECT id FROM users WHERE username=?').get(name);
if(existing)db.prepare(`UPDATE users SET password_hash=?,role='admin',status='active',guild_rank='Gildenmeister' WHERE id=?`).run(hashPassword(password),existing.id);
else db.prepare(`INSERT INTO users(id,username,password_hash,role,status,guild_rank,created_at) VALUES (?,?,?,'admin','active','Gildenmeister',?)`).run(id(),name,hashPassword(password),now());
db.prepare('DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE username=?)').run(name);
console.log(`Administrator ${name} ist bereit.\nEinmaliges Passwort: ${password}\nBitte nach dem ersten Login unter Einstellungen ändern.`);
