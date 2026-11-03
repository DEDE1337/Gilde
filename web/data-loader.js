/* Loads the catalog from the backend, then starts the UI scripts in their fixed order. */
(async()=>{
 let catalog;
 try{const r=await fetch('/api/catalog',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();catalog=await r.json()}
 catch{catalog=await(await fetch('seed-catalog.json')).json()}
 window.itemCatalog=catalog.items;window.dungeonCatalog=catalog.dungeons;
 const meta=catalog.meta,status=document.getElementById('dataStatus');
 status.textContent=meta?.live?`Itemwerte live von Wowhead Forever: ${meta.live} von ${meta.total}, zuletzt abgerufen ${new Date(meta.newest).toLocaleString('de-DE')} · Beutelisten aus ${meta.guides.live} von ${meta.guides.total} Guides`:'Itemwerte aus dem gespeicherten Stand vom 02.11.2026';
 for(const src of ['app.js','tank-ui.js','guild-ui.js','calendar-ui.js','talent-ui.js','platform-ui.js','slot-sound.js','roulette-ui.js','blackjack-ui.js','guild-tools-ui.js','polls-ui.js','armory-ui.js','charscreen.js']){const s=document.createElement('script');s.src=src;s.async=false;document.body.append(s)}
})();
