/* Texas Hold'em — Phaser 3. Engine (evaluator + betting + side pots + bots) is the
   same logic validated by 300-game self-play; only rendering/input/animation is Phaser. */
"use strict";

// ===================== validated engine =====================
const SUITS = ['♠', '♥', '♦', '♣'];
const rankStr = r => r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : r === 10 ? '10' : String(r);
const isRed = s => s === 1 || s === 2;
const cid = c => c.s*13+c.r;
function rrect(x,X,Y,w,h,r){ x.beginPath(); x.moveTo(X+r,Y); x.arcTo(X+w,Y,X+w,Y+h,r); x.arcTo(X+w,Y+h,X,Y+h,r); x.arcTo(X,Y+h,X,Y,r); x.arcTo(X,Y,X+w,Y,r); x.closePath(); }
function evaluate5(cs){const ranks=cs.map(c=>c.r).sort((a,b)=>b-a);const flush=cs.every(c=>c.s===cs[0].s);const uniq=[...new Set(ranks)];let sh=0;if(uniq.length===5){if(ranks[0]-ranks[4]===4)sh=ranks[0];else if(ranks[0]===14&&ranks[1]===5&&ranks[4]===2)sh=5;}const cnt={};for(const r of ranks)cnt[r]=(cnt[r]||0)+1;const g=Object.entries(cnt).map(([r,c])=>[c,+r]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]);const co=g.map(x=>x[0]),kr=g.map(x=>x[1]);if(sh&&flush)return[8,sh];if(co[0]===4)return[7,kr[0],kr[1]];if(co[0]===3&&co[1]===2)return[6,kr[0],kr[1]];if(flush)return[5,...ranks];if(sh)return[4,sh];if(co[0]===3)return[3,kr[0],kr[1],kr[2]];if(co[0]===2&&co[1]===2)return[2,kr[0],kr[1],kr[2]];if(co[0]===2)return[1,kr[0],kr[1],kr[2],kr[3]];return[0,...ranks];}
const cmp=(a,b)=>{const n=Math.max(a.length,b.length);for(let i=0;i<n;i++){const x=a[i]||0,y=b[i]||0;if(x!==y)return x-y;}return 0;};
function evaluate7(cs){let best=null;for(let a=0;a<7;a++)for(let b=a+1;b<7;b++){const f=cs.filter((_,i)=>i!==a&&i!==b);const s=evaluate5(f);if(!best||cmp(s,best)>0)best=s;}return best;}
const HANDN=['High card','Pair','Two pair','Three of a kind','Straight','Flush','Full house','Four of a kind','Straight flush'];
const handName=v=>v[0]===8&&v[1]===14?'Royal flush':HANDN[v[0]];

const N=4, SB=5, BB=10, START=1000, NAMES=['You','West','North','East'];
let players, button, deck, community, currentBet, minRaise, street, toAct, actionsLeft, gen=0, revealAll=false, busy=false;
const able=()=>players.filter(p=>p.inHand&&!p.folded&&!p.allIn&&p.stack>0).length;
const notFolded=()=>players.filter(p=>p.inHand&&!p.folded).length;
const pot=()=>players.reduce((a,p)=>a+p.committed,0);
const nextActive=idx=>{let i=(idx+1)%N,g=0;while((players[i].stack===0||!players[i].inHand)&&g++<N*3)i=(i+1)%N;return i;};
function commit(p,amt){amt=Math.min(amt,p.stack);p.stack-=amt;p.bet+=amt;p.committed+=amt;if(p.stack===0)p.allIn=true;return amt;}

function newGame(){ players=Array.from({length:N},(_,i)=>({name:NAMES[i],stack:START,human:i===0})); button=Math.floor(Math.random()*N); newHand(); }
function newHand(){
  gen++; revealAll=false; busy=false;
  for(const p of players){p.hole=[];p.folded=false;p.allIn=false;p.bet=0;p.committed=0;p.inHand=p.stack>0;p.last='';}
  if(players.filter(p=>p.inHand).length<2){ return S.showOver('Game over'); }
  deck=[];for(let s=0;s<4;s++)for(let r=2;r<=14;r++)deck.push({r,s});
  for(let i=deck.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[deck[i],deck[j]]=[deck[j],deck[i]];}
  for(let k=0;k<2;k++)for(const p of players)if(p.inHand)p.hole.push(deck.pop());
  community=[]; currentBet=0; minRaise=BB; street=0;
  const sb=nextActive(button), bb=nextActive(sb);
  commit(players[sb],SB); players[sb].last='SB'; commit(players[bb],BB); players[bb].last='BB'; currentBet=BB;
  toAct=nextActive(bb); actionsLeft=able();
  S.onNewHand();                       // deal animation + refresh
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
  if(p.human){ busy=false; S.enableControls(); S.refresh(); return; }
  busy=true; S.disableControls(); S.refresh();
  schedule(()=>{ const raised=applyAction(p,botDecide(p)); S.flashAction(toAct); afterAct(p,raised); }, 600);
}
function afterAct(p,raised){ if(raised)actionsLeft=able()-(p.allIn?0:1); else actionsLeft--; toAct=(toAct+1)%N; S.refresh(); stepBetting(); }
function closeRound(){
  for(const p of players)p.bet=0; currentBet=0; minRaise=BB;
  if(notFolded()<=1) return endHand();
  if(street>=3) return showdown();
  if(able()>=2){ street++; dealTo([0,3,4,5][street]); for(const p of players)p.last=''; toAct=nextInHandFromButton(); actionsLeft=able(); S.onCommunity(); schedule(stepBetting,700); }
  else { runOut(); }
}
const nextInHandFromButton=()=>{ let i=button,g=0; do{i=(i+1)%N;}while((players[i].folded||players[i].allIn||players[i].stack===0||!players[i].inHand)&&g++<N*3); return i; };
function dealTo(sz){ while(community.length<sz)community.push(deck.pop()); }
function runOut(){ S.disableControls(); if(street>=3) return showdown(); street++; dealTo([0,3,4,5][street]); S.onCommunity(); schedule(runOut,900); }
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
  busy=true; S.disableControls(); S.refresh();
  const lines=results.map(r=>{const who=r.win.map(i=>players[i].name).join(' & ');return `${who} win${r.win.length>1?'':'s'} ${r.amount}${r.name&&shown?' · '+r.name:''}`;});
  const youWon=results.some(r=>r.win.includes(0));
  let title = shown ? (youWon?'You win!':'Showdown') : lines[0];
  const alive=players.filter(p=>p.stack>0).length, ended=players[0].stack===0||alive<2;
  if(ended) title = players[0].stack>0?'You win the table! 🏆':'You busted';
  button=nextActive(button);
  schedule(()=>S.showResult(title, lines.join('\n'), ended), shown?900:350);
}

// scheduler routed through Phaser's clock so it pauses/cancels cleanly
let S=null;
function schedule(fn,d){ const g=gen; S.time.delayedCall(d,()=>{ if(g===gen) fn(); }); }

// ===================== Phaser scene (portrait, responsive via RESIZE) =====================
const ACCENT=0x5ad1c5, FELT=0x15342b, FELT_E=0x1f4a3d;

class Table extends Phaser.Scene{
  create(){
    S=this;
    this.makeCardTextures();
    this.felt=this.add.graphics();
    this.potText=this.add.text(0,0,'',{fontFamily:'system-ui',fontStyle:'800',color:'#e8ecf4'}).setOrigin(0.5);
    this.comm=[]; for(let i=0;i<5;i++) this.comm.push(this.makeCard());
    this.seats=[0,1,2,3].map(i=>this.makeSeat(i));
    this.makeControls();
    this.makeResultPanel();
    this.layout();
    this.scale.on('resize',()=>{ this.layout(); this.refresh(); });
    this.noAnim = location.hash.includes('static')||location.hash.includes('demo');
    newGame();
    if(location.hash.includes('demo')){ gen++; community=[{r:14,s:0},{r:11,s:1},{r:7,s:2},{r:3,s:2},{r:9,s:3}]; players[0].hole=[{r:14,s:1},{r:7,s:1}]; players[0].bet=40;players[0].last='Call 40'; players[1].folded=true;players[1].last='Fold'; players[2].bet=40;players[2].last='Raise 40'; players[3].bet=20;players[3].last='Call 20'; toAct=0; street=3; this.enableControls(); this.refresh(); }
    else if(location.hash.includes('static')){ gen++; this.refresh(); }
  }

  W(){ return this.scale.width||window.innerWidth; }
  H(){ return this.scale.height||window.innerHeight; }

  makeCardTextures(){
    // Bake every card face (and the back) into a texture once → cards are single Images,
    // zero live Text objects, so steady-state rendering is cheap.
    const TW=200, TH=280;
    const base=fill=>{ const c=document.createElement('canvas'); c.width=TW; c.height=TH; const x=c.getContext('2d'); rrect(x,4,4,TW-8,TH-8,22); x.fillStyle=fill; x.fill(); return {c,x}; };
    if(this.textures.exists('back')) this.textures.remove('back');
    { const {c,x}=base('#39507a'); rrect(x,TW*0.16,TH*0.12,TW*0.68,TH*0.76,14); x.fillStyle='#2a3c5e'; x.fill(); this.textures.addCanvas('back',c); }
    for(let s=0;s<4;s++)for(let r=2;r<=14;r++){
      const {c,x}=base('#f5f2ea'); x.lineWidth=4; x.strokeStyle='#cabfa6'; rrect(x,4,4,TW-8,TH-8,22); x.stroke();
      x.fillStyle=isRed(s)?'#c2413f':'#1d2330';
      x.textAlign='left'; x.textBaseline='top'; x.font='800 '+Math.round(TH*0.25)+'px system-ui'; x.fillText(rankStr(r),TW*0.13,TH*0.07);
      x.textAlign='center'; x.textBaseline='middle'; x.font=Math.round(TH*0.4)+'px system-ui'; x.fillText(SUITS[s],TW/2,TH*0.6);
      const key='c'+(s*13+r); if(this.textures.exists(key))this.textures.remove(key); this.textures.addCanvas(key,c);
    }
  }

  makeCard(){
    const cont=this.add.container(0,0);
    const img=this.add.image(0,0,'back');
    cont.add(img); cont.img=img; cont.setVisible(false);
    cont.size=(w,h)=>{ cont.cw=w; cont.ch=h; img.setDisplaySize(w,h); };
    cont.set=(card,faceUp,faded)=>{
      if(!card){cont.setVisible(false);return;}
      cont.setVisible(true); cont.setAlpha(faded?0.5:1);
      img.setTexture(faceUp?('c'+cid(card)):'back'); img.setDisplaySize(cont.cw||40,cont.ch||56);
    };
    return cont;
  }

  makeSeat(i){
    const cont=this.add.container(0,0);
    const ring=this.add.graphics();
    const c1=this.makeCard(), c2=this.makeCard();
    const name=this.add.text(0,0,'',{fontFamily:'system-ui',fontStyle:'700',color:'#cdd6e3'}).setOrigin(0.5);
    const info=this.add.text(0,0,'',{fontFamily:'system-ui',fontStyle:'700',color:'#9aa3b2'}).setOrigin(0.5);
    const dealer=this.add.container(0,0); const dg=this.add.graphics(); dg.fillStyle(0xe8ecf4,1).fillCircle(0,0,11);
    const dt=this.add.text(0,0,'D',{fontFamily:'system-ui',fontStyle:'800',fontSize:'14px',color:'#0e1116'}).setOrigin(0.5);
    dealer.add([dg,dt]); dealer.setVisible(false);
    cont.add([ring,c1,c2,name,info,dealer]);
    return {cont,c1,c2,name,info,ring,dealer};
  }

  makeControls(){
    this.btns={};
    const mk=(key,label,stroke,color)=>{ const cont=this.add.container(0,0);
      const g=this.add.graphics(); const t=this.add.text(0,0,label,{fontFamily:'system-ui',fontStyle:'700',color}).setOrigin(0.5);
      cont.add([g,t]); cont.g=g; cont.label=t; cont.stroke=stroke;
      cont.on('pointerdown',()=>this.onBtn(key)); this.btns[key]=cont; };
    mk('fold','Fold',0x3a2a2c,'#e98b86'); mk('call','Check',0x27403d,'#7fe0d6');
    mk('half','½ Pot',0x283041,'#e8ecf4'); mk('potb','Pot',0x283041,'#e8ecf4'); mk('allin','All-in',0x3a3320,'#e6c976');
    this.disableControls();
  }
  setBox(b,x,y,w,h){ b.setPosition(x,y); b.g.clear(); b.g.fillStyle(0x161b24,1).fillRoundedRect(-w/2,-h/2,w,h,12); b.g.lineStyle(1,b.stroke,1).strokeRoundedRect(-w/2,-h/2,w,h,12);
    b.label.setFontSize(Math.max(13,Math.round(h*0.34))); b.setSize(w,h).setInteractive(new Phaser.Geom.Rectangle(-w/2,-h/2,w,h),Phaser.Geom.Rectangle.Contains); }

  makeResultPanel(){
    this.panel=this.add.container(0,0).setDepth(50).setVisible(false);
    this.panelG=this.add.graphics();
    this.panelTitle=this.add.text(0,0,'',{fontFamily:'system-ui',fontStyle:'900',color:'#5ad1c5',align:'center'}).setOrigin(0.5);
    this.panelBody=this.add.text(0,0,'',{fontFamily:'system-ui',color:'#e8ecf4',align:'center',lineSpacing:7}).setOrigin(0.5);
    this.panelBtn=this.add.container(0,0); this.panelBtnG=this.add.graphics();
    this.panelBtnText=this.add.text(0,0,'Next hand',{fontFamily:'system-ui',fontStyle:'800',color:'#0e1116'}).setOrigin(0.5);
    this.panelBtn.add([this.panelBtnG,this.panelBtnText]);
    this.panelBtn.on('pointerdown',()=>{ this.panel.setVisible(false); if(this.panelEnded) newGame(); else newHand(); });
    this.panel.add([this.panelG,this.panelTitle,this.panelBody,this.panelBtn]);
  }

  // ---------------- responsive layout ----------------
  layout(){
    const w=this.W(), h=this.H();
    this.felt.clear();
    this.felt.fillStyle(FELT,1).fillRoundedRect(w*0.03,h*0.05,w*0.94,h*0.78,w*0.06);
    this.felt.lineStyle(2,FELT_E,1).strokeRoundedRect(w*0.03,h*0.05,w*0.94,h*0.78,w*0.06);
    // community
    const cw=Math.min(w*0.155,h*0.085), ch=cw*1.4, gap=cw*0.16, gw=5*cw+4*gap, sx=w/2-gw/2+cw/2, cy=h*0.42;
    this.comm.forEach((c,i)=>{ c.size(cw,ch); c.setPosition(sx+i*(cw+gap),cy); });
    this.potText.setFontSize(Math.max(15,Math.round(w*0.05))).setPosition(w/2,cy+ch/2+h*0.035);
    this.commGeo={cw,ch,cy};
    // seats: bots across the top, You at the bottom
    const sCW=Math.min(w*0.13,h*0.07), yCW=Math.min(w*0.17,h*0.092);
    this.layoutSeat(1, w*0.20, h*0.15, sCW);
    this.layoutSeat(2, w*0.50, h*0.15, sCW);
    this.layoutSeat(3, w*0.80, h*0.15, sCW);
    this.layoutSeat(0, w*0.50, h*0.65, yCW);
    // controls — two rows below the felt
    const bh=Math.min(h*0.062,w*0.13), m=w*0.025;
    const w1=(w-3*m)/2, y1=h*0.875;
    this.setBox(this.btns.fold, m+w1/2, y1, w1, bh);
    this.setBox(this.btns.call, m*2+w1*1.5, y1, w1, bh);
    const w2=(w-4*m)/3, y2=h*0.955;
    ['half','potb','allin'].forEach((k,j)=>this.setBox(this.btns[k], m+w2/2+j*(w2+m), y2, w2, bh));
    // result panel
    const pw=Math.min(w*0.9,520), ph=Math.min(h*0.42,300);
    this.panel.setPosition(w/2,h*0.45);
    this.panelG.clear(); this.panelG.fillStyle(0x090c10,0.92).fillRoundedRect(-pw/2,-ph/2,pw,ph,18).lineStyle(2,0x283041,1).strokeRoundedRect(-pw/2,-ph/2,pw,ph,18);
    this.panelTitle.setFontSize(Math.round(w*0.07)).setPosition(0,-ph*0.32);
    this.panelBody.setFontSize(Math.round(w*0.04)).setPosition(0,-ph*0.02).setWordWrapWidth(pw*0.85);
    const pbw=Math.min(pw*0.5,200), pbh=ph*0.2; this.panelBtn.setPosition(0,ph*0.32);
    this.panelBtnG.clear(); this.panelBtnG.fillStyle(0x5ad1c5,1).fillRoundedRect(-pbw/2,-pbh/2,pbw,pbh,12);
    this.panelBtnText.setFontSize(Math.round(pbh*0.42)); this.panelBtn.setSize(pbw,pbh).setInteractive(new Phaser.Geom.Rectangle(-pbw/2,-pbh/2,pbw,pbh),Phaser.Geom.Rectangle.Contains);
  }
  layoutSeat(i,x,y,cw){
    const s=this.seats[i], ch=cw*1.4, fs=Math.max(11,Math.round(cw*0.32));
    s.cont.setPosition(x,y); s.cw=cw; s.ch=ch;
    s.c1.size(cw,ch); s.c1.setPosition(-(cw/2+3),0); s.c2.size(cw,ch); s.c2.setPosition(cw/2+3,0);
    s.name.setFontSize(fs).setPosition(0,-ch/2-fs*0.85);
    s.info.setFontSize(Math.max(10,Math.round(cw*0.27))).setPosition(0,ch/2+fs*0.78);
    const side=x>this.W()/2?-1:1; s.dealer.setPosition(side*(cw+16),0);
  }

  // ---------------- engine callbacks ----------------
  onNewHand(){
    this.panel.setVisible(false);
    for(const c of this.comm){ c.set(null); c._shown=false; }
    this.refresh();
    if(this.noAnim) return;
    this.seats.forEach((seat,i)=>{ [seat.c1,seat.c2].forEach((c,k)=>{ if(!c.visible)return;
      c.setScale(0.7).setAlpha(0); this.tweens.add({targets:c,scale:1,alpha:1,duration:240,delay:(i*2+k)*55,ease:'Back.out'}); }); });
  }
  onCommunity(){
    this.refresh();
    if(this.noAnim) return;
    for(let i=0;i<5;i++){ const c=this.comm[i];
      if(i<community.length && !c._shown){ c._shown=true; c.setScale(0.6).setAlpha(0); this.tweens.add({targets:c,scale:1,alpha:1,duration:240,delay:i*55,ease:'Back.out'}); }
      if(i>=community.length) c._shown=false; }
  }
  flashAction(i){ this.tweens.add({targets:this.seats[i].cont,scale:{from:1.05,to:1},duration:170}); }

  refresh(){
    this.potText.setText('Pot  '+pot());
    for(let i=0;i<5;i++) this.comm[i].set(i<community.length?community[i]:null,true);
    this.seats.forEach((seat,i)=>{
      const p=players[i], turn=(toAct===i)&&p.inHand&&!p.folded&&notFolded()>1&&able()>0;
      const showFace=(i===0)||(revealAll&&!p.folded);
      seat.c1.set(p.inHand?p.hole[0]:null,showFace,p.folded); seat.c2.set(p.inHand?p.hole[1]:null,showFace,p.folded);
      seat.name.setText(i===0?'You':p.name).setColor(turn?'#5ad1c5':(p.folded?'#5b6577':'#cdd6e3'));
      let info='▮ '+p.stack, col='#9aa3b2';
      if(p.folded){ info='Fold'; col='#5b6577'; }
      else if(p.bet>0){ info='bet '+p.bet; col='#d8b25a'; }
      else if(p.last&&!revealAll){ info=p.last; col=turn?'#5ad1c5':'#7c879c'; }
      seat.info.setText(p.inHand?info:'out').setColor(col);
      seat.dealer.setVisible(i===button);
      seat.ring.clear();
      if(turn){ const cw=seat.cw||40, ch=seat.ch||56; seat.ring.lineStyle(3,ACCENT,1).strokeRoundedRect(-(cw+9),-(ch/2+Math.round(cw*0.34)+6),(cw+9)*2,ch+Math.round(cw*0.34)*2+12,10); }
    });
  }

  setStatus(){}
  enableControls(){
    const p=players[0], cc=currentBet-p.bet;
    this.showBtn('fold',true); this.showBtn('call',true);
    this.btns.call.label.setText(cc<=0?'Check':('Call '+Math.min(cc,p.stack)));
    const canRaise=able()>1 && p.stack>Math.max(0,cc), pn=pot();
    this.raiseAmt={ half:Math.min(p.bet+p.stack,currentBet+Math.max(minRaise,Math.round(pn*0.5))),
                    potb:Math.min(p.bet+p.stack,currentBet+Math.max(minRaise,pn)), allin:p.bet+p.stack };
    this.showBtn('half',canRaise && this.raiseAmt.half<this.raiseAmt.allin);
    this.showBtn('potb',canRaise && this.raiseAmt.potb<this.raiseAmt.allin);
    this.showBtn('allin',canRaise);
  }
  disableControls(){ for(const k in this.btns) this.showBtn(k,false); }
  showBtn(k,on){ const b=this.btns[k]; if(!b)return; b.setVisible(on); if(b.input)b.input.enabled=on; }
  onBtn(k){
    if(busy||toAct!==0) return;
    const p=players[0], cc=currentBet-p.bet; let act;
    if(k==='fold') act={type:'fold'};
    else if(k==='call') act={type:cc<=0?'check':'call'};
    else if(k==='half') act={type:'raise',amount:this.raiseAmt.half};
    else if(k==='potb') act={type:'raise',amount:this.raiseAmt.potb};
    else if(k==='allin') act={type:'raise',amount:this.raiseAmt.allin};
    if(!act) return;
    busy=true; this.disableControls();
    const raised=applyAction(p,act); this.flashAction(0); afterAct(p,raised);
  }
  showResult(title,body,ended){ this.panelEnded=ended; this.panelTitle.setText(title); this.panelBody.setText(body);
    this.panelBtnText.setText(ended?'New game':'Next hand'); this.panel.setVisible(true).setScale(0.9);
    this.tweens.add({targets:this.panel,scale:1,duration:200,ease:'Back.out'}); }
  showOver(t){ this.showResult(t,'',true); }
}

new Phaser.Game({
  type: Phaser.AUTO, backgroundColor:'#0e1116',
  fps:{ target:30, forceSetTimeOut:true },          // turn-based: 30fps is plenty, halves idle GPU load
  render:{ roundPixels:true, powerPreference:'low-power' },
  scale:{ mode:Phaser.Scale.RESIZE, parent:'game', width:'100%', height:'100%' },
  scene:[Table]
});
