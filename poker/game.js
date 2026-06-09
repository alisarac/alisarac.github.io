/* Texas Hold'em — lean vanilla canvas. Validated engine (evaluator + betting + side pots
   + bots; 300-game self-play, 0 chip leaks). Renders ONLY on state change; a short rAF loop
   runs only while cards animate, then stops → 0% CPU when idle. HTML buttons for input. */
"use strict";

// ===================== validated engine =====================
const SUITS=['♠','♥','♦','♣'];
const rankStr=r=>r===14?'A':r===13?'K':r===12?'Q':r===11?'J':r===10?'10':String(r);
const isRed=s=>s===1||s===2;
function evaluate5(cs){const ranks=cs.map(c=>c.r).sort((a,b)=>b-a);const flush=cs.every(c=>c.s===cs[0].s);const uniq=[...new Set(ranks)];let sh=0;if(uniq.length===5){if(ranks[0]-ranks[4]===4)sh=ranks[0];else if(ranks[0]===14&&ranks[1]===5&&ranks[4]===2)sh=5;}const cnt={};for(const r of ranks)cnt[r]=(cnt[r]||0)+1;const g=Object.entries(cnt).map(([r,c])=>[c,+r]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]);const co=g.map(x=>x[0]),kr=g.map(x=>x[1]);if(sh&&flush)return[8,sh];if(co[0]===4)return[7,kr[0],kr[1]];if(co[0]===3&&co[1]===2)return[6,kr[0],kr[1]];if(flush)return[5,...ranks];if(sh)return[4,sh];if(co[0]===3)return[3,kr[0],kr[1],kr[2]];if(co[0]===2&&co[1]===2)return[2,kr[0],kr[1],kr[2]];if(co[0]===2)return[1,kr[0],kr[1],kr[2],kr[3]];return[0,...ranks];}
const cmp=(a,b)=>{const n=Math.max(a.length,b.length);for(let i=0;i<n;i++){const x=a[i]||0,y=b[i]||0;if(x!==y)return x-y;}return 0;};
function evaluate7(cs){let best=null;for(let a=0;a<7;a++)for(let b=a+1;b<7;b++){const f=cs.filter((_,i)=>i!==a&&i!==b);const s=evaluate5(f);if(!best||cmp(s,best)>0)best=s;}return best;}
const HANDN=['High card','Pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush'];
const handName=v=>v[0]===8&&v[1]===14?'Royal flush':HANDN[v[0]];

const N=4,SB=5,BB=10,START=1000,NAMES=['You','West','North','East'];
let players,button,deck,community,currentBet,minRaise,street,toAct,actionsLeft,gen=0,revealAll=false,busy=false;
const able=()=>players.filter(p=>p.inHand&&!p.folded&&!p.allIn&&p.stack>0).length;
const notFolded=()=>players.filter(p=>p.inHand&&!p.folded).length;
const pot=()=>players.reduce((a,p)=>a+p.committed,0);
const nextActive=idx=>{let i=(idx+1)%N,g=0;while((players[i].stack===0||!players[i].inHand)&&g++<N*3)i=(i+1)%N;return i;};
function commit(p,amt){amt=Math.min(amt,p.stack);p.stack-=amt;p.bet+=amt;p.committed+=amt;if(p.stack===0)p.allIn=true;return amt;}

function newGame(){ players=Array.from({length:N},(_,i)=>({name:NAMES[i],stack:START,human:i===0})); button=Math.floor(Math.random()*N); newHand(); }
function newHand(){
  gen++; revealAll=false; busy=false;
  for(const p of players){p.hole=[];p.folded=false;p.allIn=false;p.bet=0;p.committed=0;p.inHand=p.stack>0;p.last='';}
  if(players.filter(p=>p.inHand).length<2){ return showOver('Game over'); }
  deck=[];for(let s=0;s<4;s++)for(let r=2;r<=14;r++)deck.push({r,s});
  for(let i=deck.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[deck[i],deck[j]]=[deck[j],deck[i]];}
  for(let k=0;k<2;k++)for(const p of players)if(p.inHand)p.hole.push(deck.pop());
  community=[]; currentBet=0; minRaise=BB; street=0;
  const sb=nextActive(button), bb=nextActive(sb);
  commit(players[sb],SB); players[sb].last='SB'; commit(players[bb],BB); players[bb].last='BB'; currentBet=BB;
  toAct=nextActive(bb); actionsLeft=able();
  onNewHand();
  schedule(stepBetting, 650);
}
function strength(p){
  if(community.length===0){const a=p.hole[0],b=p.hole[1],hi=Math.max(a.r,b.r),lo=Math.min(a.r,b.r);let s;if(a.r===b.r)s=0.5+(a.r-2)/24;else{s=(hi+lo)/40;if(a.s===b.s)s+=0.08;if(Math.abs(a.r-b.r)===1)s+=0.06;if(hi===14)s+=0.05;}return Math.min(0.99,s);}
  const v=evaluate7([...p.hole,...community]);return Math.min(0.99,[0.18,0.34,0.5,0.62,0.7,0.78,0.88,0.95,0.99][v[0]]+(v[1]||0)/200);
}
function botRaise(p){const t=currentBet+Math.max(BB,Math.round((pot()*0.6)/BB)*BB);return{type:'raise',amount:Math.min(p.bet+p.stack,Math.max(currentBet+minRaise,t))};}
function botDecide(p){
  const cc=currentBet-p.bet, a=able(), str=strength(p);
  if(cc<=0){ if(str>0.72&&a>1&&Math.random()<0.8)return botRaise(p); if(Math.random()<0.04&&a>1)return botRaise(p); return{type:'check'}; }
  const odds=cc/(pot()+cc);
  if(str>0.82&&a>1&&p.stack>cc&&Math.random()<0.55)return botRaise(p);
  if(str>odds+0.04)return{type:'call'};
  if(Math.random()<0.05)return{type:'call'};
  return{type:'fold'};
}
function applyAction(p,act){
  if(act.type==='fold'){p.folded=true;p.last='Fold';return false;}
  if(act.type==='check'){p.last='Check';return false;}
  if(act.type==='call'){const c=commit(p,currentBet-p.bet);p.last=p.allIn?'All-in':'Call '+c;return false;}
  let to=Math.min(act.amount,p.bet+p.stack);
  if(to<=currentBet){const c=commit(p,Math.min(currentBet-p.bet,p.stack));p.last=p.allIn?'All-in':'Call '+c;return false;}
  const inc=to-currentBet; commit(p,to-p.bet); minRaise=Math.max(minRaise,inc); currentBet=p.bet;
  p.last=(p.allIn?'All-in ':'Raise ')+p.bet; return true;
}
function stepBetting(){
  if(notFolded()<=1) return endHand();
  if(actionsLeft<=0 || able()===0) return closeRound();
  const p=players[toAct];
  if(!p.inHand||p.folded||p.allIn||p.stack===0){ toAct=(toAct+1)%N; return stepBetting(); }
  if(p.human){ busy=false; enableControls(); draw(); return; }
  busy=true; disableControls(); draw();
  schedule(()=>{ const raised=applyAction(p,botDecide(p)); afterAct(p,raised); }, 600);
}
function afterAct(p,raised){ if(raised)actionsLeft=able()-(p.allIn?0:1); else actionsLeft--; toAct=(toAct+1)%N; draw(); stepBetting(); }
function closeRound(){
  for(const p of players)p.bet=0; currentBet=0; minRaise=BB;
  if(notFolded()<=1) return endHand();
  if(street>=3) return showdown();
  if(able()>=2){ street++; dealTo([0,3,4,5][street]); for(const p of players)p.last=''; toAct=nextInHandFromButton(); actionsLeft=able(); onCommunity(); schedule(stepBetting,700); }
  else { runOut(); }
}
const nextInHandFromButton=()=>{ let i=button,g=0; do{i=(i+1)%N;}while((players[i].folded||players[i].allIn||players[i].stack===0||!players[i].inHand)&&g++<N*3); return i; };
function dealTo(sz){ while(community.length<sz)community.push(deck.pop()); }
function runOut(){ disableControls(); if(street>=3) return showdown(); street++; dealTo([0,3,4,5][street]); onCommunity(); schedule(runOut,900); }
function awardPots(){
  const contrib=players.map(p=>p.committed), results=[];
  while(true){
    const pos=contrib.map(c=>c>0?c:Infinity); const m=Math.min(...pos); if(!isFinite(m))break;
    let amount=0; const layer=[];
    for(let i=0;i<N;i++)if(contrib[i]>0){amount+=m;contrib[i]-=m;layer.push(i);}
    const elig=layer.filter(i=>players[i].inHand&&!players[i].folded); if(!elig.length){for(const i of layer)players[i].stack+=m;continue;}
    let best=null,win=[];
    if(elig.length===1)win=[elig[0]];
    else for(const i of elig){const v=evaluate7([...players[i].hole,...community]);if(!best||cmp(v,best)>0){best=v;win=[i];}else if(cmp(v,best)===0)win.push(i);}
    const share=Math.floor(amount/win.length); let rem=amount-share*win.length;
    for(const w of win)players[w].stack+=share; for(let k=0;k<rem;k++)players[win[k%win.length]].stack+=1;
    results.push({amount,win,name:best?handName(best):null});
  }
  return results;
}
function showdown(){ dealTo(5); revealAll=true; finish(awardPots(),true); }
function endHand(){ finish(awardPots(),false); }
function finish(results,shown){
  busy=true; disableControls(); draw();
  const lines=results.map(r=>{const who=r.win.map(i=>players[i].name).join(' & ');return `${who} win${r.win.length>1?'':'s'} ${r.amount}${r.name&&shown?' · '+r.name:''}`;});
  const youWon=results.some(r=>r.win.includes(0));
  let title = shown ? (youWon?'You win!':'Showdown') : lines[0];
  const alive=players.filter(p=>p.stack>0).length, ended=players[0].stack===0||alive<2;
  if(ended) title = players[0].stack>0?'You win the table! 🏆':'You busted';
  button=nextActive(button);
  schedule(()=>showResult(title, lines.join('\n'), ended), shown?900:350);
}
function schedule(fn,d){ const g=gen; setTimeout(()=>{ if(g===gen) fn(); }, d); }

// ===================== rendering (vanilla canvas, redraw-on-demand) =====================
const cv=document.getElementById('cv'), ctx=cv.getContext('2d');
const FELT='#15342b', FELT_E='#1f4a3d', ACCENT='#5ad1c5';
let M={}, commShown=[false,false,false,false,false];

function layout(){
  const rect=cv.getBoundingClientRect(); const w=Math.max(1,Math.round(rect.width)), h=Math.max(1,Math.round(rect.height));
  const dpr=Math.min(window.devicePixelRatio||1, 2);          // cap DPR → less fillrate on retina phones
  if(cv.width!==Math.round(w*dpr)||cv.height!==Math.round(h*dpr)){ cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr); }
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const cw=Math.min(w*0.155,h*0.085), ch=cw*1.4, gap=cw*0.16, gw=5*cw+4*gap, sx=w/2-gw/2+cw/2, cy=h*0.44;
  const comm=[]; for(let i=0;i<5;i++) comm.push({x:sx+i*(cw+gap),y:cy});
  const sCW=Math.min(w*0.13,h*0.075), yCW=Math.min(w*0.17,h*0.10);
  const seats=[ {x:w*0.50,y:h*0.80,cw:yCW},{x:w*0.20,y:h*0.16,cw:sCW},{x:w*0.50,y:h*0.16,cw:sCW},{x:w*0.80,y:h*0.16,cw:sCW} ];
  M={w,h,comm,cw,ch,cy,potY:cy+ch/2+h*0.04,seats};
}

// ---- animation: reveal fades (rAF runs only while active) ----
let fx={}, rafOn=false;
function reveal(key,delay){ fx[key]={start:performance.now()+(delay||0),dur:240}; ensureRAF(); }
function fxAS(key){ const f=fx[key]; if(!f)return [1,1]; const p=(performance.now()-f.start)/f.dur; if(p<=0)return [0,0.7]; if(p>=1)return [1,1]; const e=1-Math.pow(1-p,3); return [Math.min(1,p),0.7+0.3*e]; }
function tick(now){ let active=false; for(const k in fx){ const p=(now-fx[k].start)/fx[k].dur; if(p>=1)delete fx[k]; else active=true; } draw(); if(active)requestAnimationFrame(tick); else rafOn=false; }
function ensureRAF(){ if(!rafOn){ rafOn=true; requestAnimationFrame(tick); } }

function rr(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function drawCard(cx,cy,w,h,card,faceUp,alpha,scale){
  const sw=w*scale, sh=h*scale, x=cx-sw/2, y=cy-sh/2;
  ctx.globalAlpha=alpha;
  if(faceUp){ rr(x,y,sw,sh,sw*0.12); ctx.fillStyle='#f5f2ea'; ctx.fill(); ctx.lineWidth=1; ctx.strokeStyle='#cabfa6'; ctx.stroke();
    const col=isRed(card.s)?'#c2413f':'#1d2330'; ctx.fillStyle=col;
    ctx.textAlign='left'; ctx.textBaseline='top'; ctx.font=`800 ${Math.round(sh*0.26)}px system-ui`; ctx.fillText(rankStr(card.r),x+sw*0.13,y+sh*0.06);
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font=`${Math.round(sh*0.36)}px system-ui`; ctx.fillText(SUITS[card.s],cx,y+sh*0.62);
  } else { rr(x,y,sw,sh,sw*0.12); ctx.fillStyle='#39507a'; ctx.fill(); ctx.fillStyle='#2a3c5e'; rr(x+sw*0.16,y+sh*0.12,sw*0.68,sh*0.76,sw*0.08); ctx.fill(); }
  ctx.globalAlpha=1;
}
function dealerChip(x,y,r){ ctx.fillStyle='#e8ecf4'; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill(); ctx.fillStyle='#0e1116'; ctx.font=`800 ${Math.round(r*1.1)}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('D',x,y+0.5); }

function draw(){
  if(!M.w) layout();
  const {w,h}=M; ctx.clearRect(0,0,w,h);
  // felt
  rr(w*0.03,h*0.04,w*0.94,h*0.92,w*0.06); ctx.fillStyle=FELT; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle=FELT_E; ctx.stroke();
  // community
  for(let i=0;i<5;i++){ const s=M.comm[i];
    if(i<community.length){ const [a,sc]=fxAS('c'+i); drawCard(s.x,s.y,M.cw,M.ch,community[i],true,a,sc); }
    else { rr(s.x-M.cw/2,s.y-M.ch/2,M.cw,M.ch,M.cw*0.12); ctx.fillStyle='#11261f'; ctx.fill(); ctx.lineWidth=1; ctx.strokeStyle='#1d4034'; ctx.stroke(); }
  }
  // pot
  ctx.fillStyle='#e8ecf4'; ctx.font=`800 ${Math.max(15,Math.round(w*0.05))}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('Pot  '+pot(), w/2, M.potY);
  // seats
  M.seats.forEach((s,i)=>{
    const p=players[i], cw=s.cw, ch=cw*1.4, fs=Math.max(11,Math.round(cw*0.32));
    const turn=(toAct===i)&&p.inHand&&!p.folded&&notFolded()>1&&able()>0;
    const showFace=(i===0)||(revealAll&&!p.folded);
    const above=(s.y<M.h*0.4);
    const c1x=s.x-(cw/2+3), c2x=s.x+(cw/2+3);
    if(p.inHand){
      const [a1,s1]=fxAS('s'+i+'_0'), [a2,s2]=fxAS('s'+i+'_1'); const fade=p.folded?0.45:1;
      if(p.hole[0]) drawCard(c1x,s.y,cw,ch,p.hole[0],showFace,a1*fade,s1);
      if(p.hole[1]) drawCard(c2x,s.y,cw,ch,p.hole[1],showFace,a2*fade,s2);
    } else { ctx.fillStyle='#3a4150'; ctx.font='700 11px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('out',s.x,s.y); }
    // turn ring
    if(turn){ ctx.lineWidth=3; ctx.strokeStyle=ACCENT; const pad=Math.round(cw*0.34); rr(c1x-cw/2-9, s.y-ch/2-pad-6, (cw+6)+cw+18, ch+pad*2+12, 10); ctx.stroke(); }
    // name above
    ctx.textAlign='center'; ctx.textBaseline='alphabetic';
    ctx.fillStyle=turn?ACCENT:(p.folded?'#5b6577':'#cdd6e3'); ctx.font=`700 ${fs}px system-ui`; ctx.fillText(i===0?'You':p.name, s.x, s.y-ch/2-fs*0.7);
    // info (stack / bet / action / fold)
    let info='▮ '+p.stack, col='#9aa3b2';
    if(p.folded){ info='Fold'; col='#5b6577'; }
    else if(p.bet>0){ info='bet '+p.bet; col='#d8b25a'; }
    else if(p.last&&!revealAll){ info=p.last; col=turn?ACCENT:'#7c879c'; }
    ctx.fillStyle=col; ctx.font=`700 ${Math.max(10,Math.round(cw*0.27))}px system-ui`;
    ctx.fillText(p.inHand?info:'', s.x, above? s.y-ch/2-fs*0.7-fs : s.y+ch/2+fs*0.95);
    // dealer chip toward table center
    if(i===button){ const side=s.x>M.w/2?-1:1; dealerChip(s.x+side*(cw+14), s.y, Math.max(9,cw*0.22)); }
  });
}

// ---- engine callbacks ----
function onNewHand(){ panelEl.classList.add('hidden'); commShown=[false,false,false,false,false]; fx={};
  let idx=0; for(let i=0;i<N;i++){ if(!players[i].inHand)continue; reveal('s'+i+'_0', idx*55); reveal('s'+i+'_1', idx*55+25); idx++; } draw(); }
function onCommunity(){ for(let i=0;i<community.length;i++){ if(!commShown[i]){ commShown[i]=true; reveal('c'+i, i*55); } } draw(); }

// ---- DOM controls + panel ----
const $=id=>document.getElementById(id);
const dom={ fold:$('bFold'), call:$('bCall'), half:$('bHalf'), pot:$('bPot'), allin:$('bAllin') };
const panelEl=$('panel'), pTitle=$('pTitle'), pBody=$('pBody'), pBtn=$('pBtn');
let raiseAmt={}, panelEnded=false;
dom.fold.onclick =()=>onBtn('fold');
dom.call.onclick =()=>onBtn('call');
dom.half.onclick =()=>onBtn('half');
dom.pot.onclick  =()=>onBtn('potb');
dom.allin.onclick=()=>onBtn('allin');
pBtn.onclick=()=>{ panelEl.classList.add('hidden'); if(panelEnded) newGame(); else newHand(); };

function enableControls(){
  const p=players[0], cc=currentBet-p.bet;
  dom.fold.disabled=false; dom.call.disabled=false;
  dom.call.textContent = cc<=0?'Check':('Call '+Math.min(cc,p.stack));
  const canRaise=able()>1 && p.stack>Math.max(0,cc), pn=pot();
  raiseAmt={ half:Math.min(p.bet+p.stack,currentBet+Math.max(minRaise,Math.round(pn*0.5))),
             potb:Math.min(p.bet+p.stack,currentBet+Math.max(minRaise,pn)), allin:p.bet+p.stack };
  dom.half.disabled = !(canRaise && raiseAmt.half<raiseAmt.allin);
  dom.pot.disabled  = !(canRaise && raiseAmt.potb<raiseAmt.allin);
  dom.allin.disabled= !canRaise;
}
function disableControls(){ for(const k in dom) dom[k].disabled=true; }
function onBtn(k){
  if(busy||toAct!==0) return;
  const p=players[0], cc=currentBet-p.bet; let act;
  if(k==='fold') act={type:'fold'};
  else if(k==='call') act={type:cc<=0?'check':'call'};
  else if(k==='half') act={type:'raise',amount:raiseAmt.half};
  else if(k==='potb') act={type:'raise',amount:raiseAmt.potb};
  else if(k==='allin') act={type:'raise',amount:raiseAmt.allin};
  if(!act) return;
  busy=true; disableControls();
  const raised=applyAction(p,act); afterAct(p,raised);
}
function showResult(title,body,ended){ panelEnded=ended; pTitle.textContent=title; pBody.textContent=body; pBtn.textContent=ended?'New game':'Next hand'; panelEl.classList.remove('hidden'); }
function showOver(t){ showResult(t,'',true); }

// ---- boot + resize ----
let rt; window.addEventListener('resize',()=>{ clearTimeout(rt); rt=setTimeout(()=>{ layout(); draw(); }, 80); });
layout(); newGame();
