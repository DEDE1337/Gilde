const modelPath=/^\/(?:meta\/[a-z]+(?:\/\d+){1,3}\.json|(?:m2|skin|skel|anim|bone|phys)\/\d+\.(?:m2|skin|skel|anim|bone|phys)|textures\/\d+\.(?:webp|png))$/;
function assetText(key){return new TextDecoder().decode(Uint8Array.from(atob(assets[key].body),c=>c.charCodeAt(0)))}
export default {async fetch(request,env,ctx){
 const url=new URL(request.url);
 if(url.pathname.startsWith('/api/events')&&request.method!=='GET')return new Response(JSON.stringify({error:'Diese Installation hat keine Accounts; der Kalender ist schreibgeschützt.'}),{status:403,headers:{'Content-Type':'application/json; charset=utf-8'}});
 if(url.pathname.startsWith('/api/events'))return handleGuildEvents(request,env,url);
 if(['/api/catalog','/api/talents'].includes(url.pathname))return handleWowheadData(request,{DB:env.DB,seedCatalog:async()=>JSON.parse(assetText('/seed-catalog.json')),seedTalents:async()=>parseTalentSeed(assetText('/forever-talents.js'))},url,ctx);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 if(url.pathname.startsWith('/model/')){
  const path=url.pathname.slice(6);
  if(!modelPath.test(path))return new Response('Unknown model asset',{status:404});
  const target='https://wow.zamimg.com/modelviewer/classic'+path;
  try{
   const response=await fetch(target,{headers:{Accept:'*/*'},cf:{cacheEverything:true,cacheTtl:86400}});
   if(!response.ok)return new Response('Model asset unavailable',{status:response.status});
   const type=path.endsWith('.json')?'application/json':path.endsWith('.webp')?'image/webp':path.endsWith('.png')?'image/png':'application/octet-stream';
   return new Response(request.method==='HEAD'?null:response.body,{headers:{'Content-Type':type,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});
  }catch{return new Response('Model provider unavailable',{status:502})}
 }
 const key=url.pathname==='/'?'/index.html':url.pathname;
 const asset=assets[key];if(!asset)return await fetchWowheadIcon(url.pathname)||new Response('Not found',{status:404});
 const bytes=Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));
 return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset.mime+(asset.mime.startsWith('text/')||asset.mime.includes('javascript')?'; charset=utf-8':''),'Cache-Control':key.endsWith('.jpg')?'public, max-age=604800':'no-cache','X-Content-Type-Options':'nosniff'}});
}};
