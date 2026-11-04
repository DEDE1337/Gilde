/* Live updates: open pages poll /api/pulse and redraw themselves when the stamp of their area changes.
   Stamps come from the database, so changes made by the raid ticker or another process show up as well. */
import {route} from './core.js';

// Every successful write through the API also bumps a counter for its area; that catches edits the stamps below cannot see (a renamed raid).
const AREAS=[['/api/forum','forum'],['/api/raids','raids'],['/api/dungeons','dungeons'],['/api/notifications','notes']],writes={};
export function noteWrite(pathname){const area=AREAS.find(([p])=>pathname.startsWith(p))?.[1];if(area)writes[area]=(writes[area]||0)+1}

export function registerLiveRoutes(db){
 const stamp=sql=>Object.values(db.prepare(sql).get()).join('|');
 route('GET','/api/pulse','member',({user})=>{
  const notes=db.prepare('SELECT COUNT(*) n,COALESCE(MAX(created_at),\'\') last,COALESCE(MAX(read_at),\'\') seen FROM notifications WHERE user_id=?').get(user.id);
  const unread=db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL').get(user.id).n;
  return{
   unread,
   areas:{
    notes:[writes.notes||0,notes.n,notes.last,notes.seen,unread].join('|'),
    forum:(writes.forum||0)+'|'+stamp(`SELECT (SELECT COUNT(*) FROM forum_topics) a,(SELECT COALESCE(MAX(last_post_at),'') FROM forum_topics) b,(SELECT COUNT(*) FROM forum_posts) c,(SELECT COALESCE(SUM(removed),0) FROM forum_posts) d,(SELECT COALESCE(MAX(edited_at),'') FROM forum_posts) e,(SELECT COUNT(*) FROM forum_likes) f,(SELECT COALESCE(MAX(created_at),'') FROM forum_likes) g,(SELECT COALESCE(SUM(pinned+locked),0) FROM forum_topics) h`),
    raids:(writes.raids||0)+'|'+stamp(`SELECT (SELECT COUNT(*) FROM raids) a,(SELECT COALESCE(MAX(updated_at),'') FROM raid_signups) b,(SELECT COUNT(*) FROM raid_signups) c,(SELECT group_concat(status) FROM (SELECT status FROM raids ORDER BY id)) d`),
    dungeons:(writes.dungeons||0)+'|'+stamp(`SELECT (SELECT COUNT(*) FROM dungeon_runs) a,(SELECT COALESCE(MAX(updated_at),'') FROM dungeon_runs) b,(SELECT COUNT(*) FROM dungeon_members) c,(SELECT COUNT(left_at) FROM dungeon_members) d,(SELECT COALESCE(MAX(joined_at),'') FROM dungeon_members) e`)
   }
  }
 });
}
