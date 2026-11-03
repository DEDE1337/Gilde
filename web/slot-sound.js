/* Slot machine sounds, synthesised in the browser so the project ships no audio files. Mute choice stays in this browser. */
const SlotSound=(()=>{
 let ctx=null,spinTimer=null,muted=false;
 try{muted=localStorage.getItem('modcheck-sound')==='off'}catch{}
 const audio=()=>{if(muted)return null;ctx||=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();return ctx};
 function tone(a,{freq,type='sine',start=0,length=.1,volume=.2,endFreq}){
  const osc=a.createOscillator(),gain=a.createGain(),t=a.currentTime+start;
  osc.type=type;osc.frequency.setValueAtTime(freq,t);if(endFreq)osc.frequency.exponentialRampToValueAtTime(endFreq,t+length);
  gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.0001,t+length);
  osc.connect(gain).connect(a.destination);osc.start(t);osc.stop(t+length+.02)
 }
 function clunk(a,start=0,volume=.3){tone(a,{freq:180,endFreq:60,type:'triangle',start,length:.11,volume});tone(a,{freq:900,type:'square',start,length:.02,volume:volume*.25})}
 function coin(a,start){const base=1900+Math.random()*1500;tone(a,{freq:base,start,length:.22,volume:.09});tone(a,{freq:base*1.51,start,length:.16,volume:.06});tone(a,{freq:base*2.76,start:start+.005,length:.09,volume:.04})}
 return{
  isMuted:()=>muted,
  toggle(){muted=!muted;try{localStorage.setItem('modcheck-sound',muted?'off':'on')}catch{}if(muted)this.stop();return muted},
  lever(){const a=audio();if(a){tone(a,{freq:420,endFreq:150,type:'sawtooth',length:.09,volume:.07});clunk(a,.09,.32)}},
  spin(duration){
   this.stop();const started=performance.now();
   const tick=()=>{const a=audio();if(!a)return;const done=(performance.now()-started)/duration;if(done>=1)return;tone(a,{freq:640+Math.random()*90,type:'square',length:.025,volume:.035});tone(a,{freq:210,type:'triangle',length:.04,volume:.05});spinTimer=setTimeout(tick,55+done*done*190)};
   tick()
  },
  land(){const a=audio();if(a)clunk(a)},
  card(){const a=audio();if(a){tone(a,{freq:1500,endFreq:500,type:'triangle',length:.05,volume:.1});tone(a,{freq:240,type:'sine',start:.02,length:.05,volume:.07})}},
  tease(){const a=audio();if(a)for(let i=0;i<8;i++)tone(a,{freq:520+i*55,type:'triangle',start:i*.22,length:.16,volume:.07})},
  coins(count){const a=audio();if(a)for(let i=0;i<count;i++)coin(a,i*.07+Math.random()*.05)},
  fanfare(){const a=audio();if(a)[523,659,784,1047,1319].forEach((freq,i)=>{tone(a,{freq,type:'triangle',start:i*.13,length:i===4?.9:.3,volume:.13});tone(a,{freq:freq/2,type:'sine',start:i*.13,length:.34,volume:.08})})},
  stop(){clearTimeout(spinTimer)}
 }
})();
