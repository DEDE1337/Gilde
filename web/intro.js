/* Intro video: plays once per browser. Browsers often block sound without a click, so a blocked start shows a play button instead of a silent video. */
const INTRO_KEY='modcheck-intro-seen';
function introSeen(){try{return localStorage.getItem(INTRO_KEY)==='1'}catch{return true}}
function showIntro(){
 if(document.querySelector('#introDialog'))return;
 const dialog=document.createElement('dialog');dialog.id='introDialog';dialog.setAttribute('aria-label','Begrüßung durch Anduin');
 dialog.innerHTML=`<video src="media/intro.mp4" playsinline preload="auto"></video><button class="intro-start" hidden>Botschaft ansehen</button><button class="intro-skip">Überspringen</button>`;
 document.body.append(dialog);
 const video=dialog.querySelector('video'),start=dialog.querySelector('.intro-start');
 const close=()=>{try{localStorage.setItem(INTRO_KEY,'1')}catch{}video.pause();dialog.remove()};
 const play=()=>video.play().then(()=>{start.hidden=true}).catch(()=>{start.hidden=false});
 video.addEventListener('ended',close);start.onclick=play;dialog.querySelector('.intro-skip').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
 dialog.showModal();play()
}
if(!introSeen())showIntro();
