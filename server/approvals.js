/* New registrations appear in #offiziere with two reactions; the first officer reaction decides. Needs MODCHECK_DISCORD_BOT_TOKEN, because webhooks cannot react. */
import {discordPost,discordEdit,botReady,botReact,botReactors} from './discord.js';
import {notify,now} from './core.js';

const YES='✅',NO='❌';

export async function requestApproval(db,{id,username}){
 const m=await discordPost('offiziere',{title:'Neue Registrierung',text:`**${username}** wartet auf Freischaltung.\n\n${YES} annehmen · ${NO} ablehnen\nOder auf der Seite: Gilde → Mitglieder → Benutzer verwalten`,color:0x5b8def});
 if(!m)return;
 db.prepare('INSERT OR REPLACE INTO register_approvals(user_id,channel_id,message_id,created_at) VALUES (?,?,?,?)').run(id,m.channelId,m.messageId,now());
 await botReact(m.channelId,m.messageId,YES);await botReact(m.channelId,m.messageId,NO)
}

// Reads the reactions of open requests. Both emojis at once count as a rejection: that can be reversed on the site, a wrong approval is the worse mistake.
export async function syncApprovals(db){
 if(!botReady())return;
 const open=db.prepare(`SELECT a.user_id,a.channel_id,a.message_id,u.username,u.status FROM register_approvals a JOIN users u ON u.id=a.user_id WHERE a.decided_at IS NULL ORDER BY a.created_at LIMIT 30`).all();
 for(const r of open){
  const close=(title,text,color)=>{db.prepare('UPDATE register_approvals SET decided_at=? WHERE user_id=?').run(now(),r.user_id);return discordEdit('offiziere',r.message_id,{title,text,color})};
  if(r.status!=='pending'){await close('Registrierung bearbeitet',`**${r.username}** wurde schon auf der Seite entschieden.`,0x8a8f9c);continue}
  const no=await botReactors(r.channel_id,r.message_id,NO);if(no===null)continue;
  const yes=no.length?[]:await botReactors(r.channel_id,r.message_id,YES);if(yes===null)continue;
  if(no.length){
   db.prepare(`UPDATE users SET status='disabled' WHERE id=? AND status='pending'`).run(r.user_id);
   await close('❌ Abgelehnt',`**${r.username}** wurde abgelehnt. Auf der Seite lässt sich das Konto wieder freischalten.`,0xe23a2c)
  }else if(yes.length){
   db.prepare(`UPDATE users SET status='active' WHERE id=? AND status='pending'`).run(r.user_id);
   notify(db,r.user_id,'Dein Konto wurde freigeschaltet. Willkommen bei ModCheck!','dashboard','approved:'+r.user_id);
   await close('✅ Angenommen',`**${r.username}** ist jetzt freigeschaltet.`,0x3fb950)
  }
 }
}
