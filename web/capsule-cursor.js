/* Capsule mouse cursor: tips over clickable things and spills powder. Mouse only; touch devices keep their normal behaviour. */
(()=>{
 if(!matchMedia('(hover:hover) and (pointer:fine)').matches)return;
 const calm=matchMedia('(prefers-reduced-motion: reduce)'),clickable='a,button,select,summary,label,[onclick],input[type=checkbox],input[type=file]',MAX_GRAINS=36;
 const cursor=document.createElement('div');cursor.id='capCursor';cursor.setAttribute('aria-hidden','true');
 cursor.innerHTML=`<i class="cap-target"></i><svg class="cap-tube" width="28" height="63" viewBox="0 0 28 63"><path d="M6 15 H22 V36 L16 60 Q14 63 12 60 L6 36 Z" fill="#dff3ffcc" stroke="#16324a" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 40 Q11 37 14 39 Q18 37 20 40 L16 59 Q14 62 12 59 Z" class="cap-powder" fill="#fff"/><path d="M9 18 V34" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><g class="cap-lid"><path d="M3 9 H25 V15 H3 Z" fill="#e9f6fd" stroke="#16324a" stroke-width="1.6" stroke-linejoin="round"/><path d="M6 2 Q14 0 22 2 V9 H6 Z" fill="#fff" stroke="#16324a" stroke-width="1.6" stroke-linejoin="round"/></g></svg>`;
 let x=0,y=0,pouring=false,grains=0,lastGrain=0,seen=false;
 function grain(){
  if(grains>=MAX_GRAINS)return;
  const dot=document.createElement('i');dot.className='cap-grain';dot.setAttribute('aria-hidden','true');
  const size=2+Math.random()*2.2,startX=x-3+Math.random()*6,startY=y-13,drift=(Math.random()-.5)*14,fall=10+Math.random()*18;
  dot.style.cssText=`width:${size}px;height:${size}px;left:${startX}px;top:${startY}px`;document.body.append(dot);grains++;
  dot.animate([{transform:'translate(0,0)',opacity:1},{transform:`translate(${drift*.4}px,${fall*.45}px)`,opacity:1,offset:.5},{transform:`translate(${drift}px,${fall}px)`,opacity:0}],{duration:420+Math.random()*320,easing:'cubic-bezier(.4,.1,1,.8)'}).onfinish=()=>{dot.remove();grains--}
 }
 function frame(t){if(pouring&&!calm.matches&&t-lastGrain>26){lastGrain=t;grain();grain()}if(pouring)requestAnimationFrame(frame)}
 function setPour(on){if(on===pouring)return;pouring=on;cursor.classList.toggle('pouring',on);if(on)requestAnimationFrame(frame)}
 function hide(){cursor.style.display='none';setPour(false)}
 document.addEventListener('mousemove',e=>{
  x=e.clientX;y=e.clientY;
  if(!seen){seen=true;document.documentElement.classList.add('capsule-on');document.body.append(cursor)}
  const el=e.target;
  if(!el.closest||el.closest('dialog')||el.matches('input:not([type=checkbox]):not([type=file]),textarea'))return hide();
  cursor.style.display='block';cursor.style.transform=`translate(${x}px,${y}px)`;setPour(!!el.closest(clickable)&&!el.closest('[disabled]'))
 },{passive:true});
 document.documentElement.addEventListener('mouseleave',hide);
})();
