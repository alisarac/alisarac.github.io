/* Texas Hold'em — Phaser 3. Engine (evaluator + betting + side pots + bots) is the
   same logic validated by 300-game self-play; only rendering/input/animation is Phaser. */
"use strict";

// ===================== validated engine =====================
const SUITS = ['♠', '♥', '♦', '♣'];
const rankStr = r => r === 14 ? 'A' : r === 13 ? 'K' : r === 12 ? 'Q' : r === 11 ? 'J' : r === 10 ? '10' : String(r);
const isRed = s => s === 1 || s === 2;
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

// ===================== Phaser scene =====================
const DW=1280, DH=720, ACCENT=0x5ad1c5, FELT=0x15342b, FELT_E=0x1f4a3d;
const SEATS=[ {x:640,y:560,big:true},{x:150,y:330},{x:640,y:120,above:true},{x:1130,y:330} ];

class Table extends Phaser.Scene{
  create(){
    S=this;
    this.makeTextures();
    // felt
    const g=this.add.graphics();
    g.fillStyle(FELT,1).lineStyle(3,FELT_E,1);
    g.fillEllipse(DW/2,330,1120,560); g.strokeEllipse(DW/2,330,1120,560);
    // pot label
    this.potText=this.add.text(DW/2,440,'',{fontFamily:'system-ui',fontSize:'30px',fontStyle:'800',color:'#e8ecf4'}).setOrigin(0.5);
    // community cards
    this.comm=[]; const cw=96,ch=134,gap=12,gw=5*cw+4*gap,sx=DW/2-gw/2+cw/2;
    for(let i=0;i<5;i++){ const c=this.makeCard(sx+i*(cw+gap),300,cw,ch); this.comm.push(c); }
    // seats
    this.seats=SEATS.map((s,i)=>this.makeSeat(i,s));
    // controls
    this.makeControls();
    // result panel
    this.makeResultPanel();
    this.noAnim = location.hash.includes('static')||location.hash.includes('demo');
    newGame();
    if(location.hash.includes('demo')){ gen++; community=[{r:14,s:0},{r:11,s:1},{r:7,s:2},{r:3,s:2},{r:9,s:3}]; players[0].hole=[{r:14,s:1},{r:7,s:1}]; players[0].bet=40;players[0].last='Call 40'; players[1].folded=true;players[1].last='Fold'; players[2].bet=40;players[2].last='Raise 40'; players[3].bet=20;players[3].last='Call 20'; toAct=0; street=3; this.enableControls(); this.refresh(); }
    else if(location.hash.includes('static')){ gen++; this.refresh(); }
  }

  makeTextures(){
    // card face
    let g=this.make.graphics({x:0,y:0,add:false});
    g.fillStyle(0xf5f2ea,1).fillRoundedRect(0,0,184,256,20); g.lineStyle(3,0xcabfa6,1).strokeRoundedRect(1,1,182,254,20);
    g.generateTexture('face',184,256); g.destroy();
    // card back
    g=this.make.graphics({x:0,y:0,add:false});
    g.fillStyle(0x39507a,1).fillRoundedRect(0,0,184,256,20); g.fillStyle(0x2a3c5e,1).fillRoundedRect(26,28,132,200,14);
    g.generateTexture('back',184,256); g.destroy();
    // dealer button
    g=this.make.graphics({x:0,y:0,add:false});
    g.fillStyle(0xe8ecf4,1).fillCircle(18,18,18); g.generateTexture('dealer',36,36); g.destroy();
  }

  makeCard(x,y,w,h){
    const cont=this.add.container(x,y);
    const bg=this.add.image(0,0,'face').setDisplaySize(w,h);
    const rank=this.add.text(-w/2+w*0.14,-h/2+h*0.07,'',{fontFamily:'system-ui',fontStyle:'800',fontSize:`${Math.round(h*0.26)}px`}).setOrigin(0,0);
    const suit=this.add.text(0,h*0.08,'',{fontFamily:'system-ui',fontSize:`${Math.round(h*0.34)}px`}).setOrigin(0.5);
    cont.add([bg,rank,suit]); cont.setSize(w,h); cont.bg=bg; cont.rank=rank; cont.suit=suit; cont.cw=w; cont.ch=h;
    cont.setVisible(false);
    cont.set=(card,faceUp,faded)=>{
      if(!card){cont.setVisible(false);return;}
      cont.setVisible(true); cont.setAlpha(faded?0.5:1);
      if(faceUp){ bg.setTexture('face'); const col=isRed(card.s)?'#c2413f':'#1d2330';
        rank.setText(rankStr(card.r)).setColor(col).setVisible(true);
        suit.setText(SUITS[card.s]).setColor(col).setVisible(true);
      } else { bg.setTexture('back'); rank.setVisible(false); suit.setVisible(false); }
    };
    return cont;
  }

  makeSeat(i,s){
    const cw=s.big?96:78, ch=cw*1.4;
    const cont=this.add.container(s.x,s.y);
    const c1=this.makeCard(-(cw/2+3),0,cw,ch), c2=this.makeCard(cw/2+3,0,cw,ch);
    const name=this.add.text(0,-ch/2-12,'',{fontFamily:'system-ui',fontStyle:'700',fontSize:'19px',color:'#cdd6e3'}).setOrigin(0.5);
    const yOff=s.above? -ch/2-32 : ch/2+14;
    const info=this.add.text(0,yOff,'',{fontFamily:'system-ui',fontStyle:'700',fontSize:'17px',color:'#9aa3b2'}).setOrigin(0.5);
    const ring=this.add.graphics();
    const dealer=this.add.image(0,0,'dealer').setVisible(false);
    const dtext=this.add.text(0,0,'D',{fontFamily:'system-ui',fontStyle:'800',fontSize:'15px',color:'#0e1116'}).setOrigin(0.5).setVisible(false);
    cont.add([ring,c1,c2,name,info,dealer,dtext]);
    return {cont,c1,c2,name,info,ring,dealer,dtext,cw,ch,above:s.above,x:s.x,y:s.y};
  }

  makeControls(){
    this.btns={};
    const defs=[ ['fold','Fold',0x3a2a2c,'#e98b86'], ['call','Check',0x27403d,'#7fe0d6'],
                 ['half','½ Pot',0x283041,'#e8ecf4'], ['potb','Pot',0x283041,'#e8ecf4'], ['allin','All-in',0x3a3320,'#e6c976'] ];
    const w=232, h=64, gap=14, total=defs.length*w+(defs.length-1)*gap, sx=DW/2-total/2+w/2, y=680;
    defs.forEach((d,i)=>{
      const x=sx+i*(w+gap), cont=this.add.container(x,y);
      const g=this.add.graphics(); g.fillStyle(0x161b24,1).fillRoundedRect(-w/2,-h/2,w,h,14); g.lineStyle(1,d[2],1).strokeRoundedRect(-w/2,-h/2,w,h,14);
      const t=this.add.text(0,0,d[1],{fontFamily:'system-ui',fontStyle:'700',fontSize:'24px',color:d[3]}).setOrigin(0.5);
      cont.add([g,t]); cont.setSize(w,h).setInteractive(new Phaser.Geom.Rectangle(-w/2,-h/2,w,h),Phaser.Geom.Rectangle.Contains);
      cont.label=t;
      cont.on('pointerdown',()=>this.onBtn(d[0]));
      this.btns[d[0]]=cont;
    });
    this.disableControls();
  }
  makeResultPanel(){
    this.panel=this.add.container(DW/2,330).setDepth(50).setVisible(false);
    const g=this.add.graphics(); g.fillStyle(0x090c10,0.9).fillRoundedRect(-330,-120,660,240,20); g.lineStyle(2,0x283041,1).strokeRoundedRect(-330,-120,660,240,20);
    this.panelTitle=this.add.text(0,-70,'',{fontFamily:'system-ui',fontStyle:'900',fontSize:'34px',color:'#5ad1c5'}).setOrigin(0.5);
    this.panelBody=this.add.text(0,5,'',{fontFamily:'system-ui',fontSize:'19px',color:'#e8ecf4',align:'center',lineSpacing:8}).setOrigin(0.5);
    const bw=200,bh=56; const btn=this.add.container(0,80);
    const bg=this.add.graphics(); bg.fillStyle(0x5ad1c5,1).fillRoundedRect(-bw/2,-bh/2,bw,bh,12);
    this.panelBtnText=this.add.text(0,0,'Next hand',{fontFamily:'system-ui',fontStyle:'800',fontSize:'22px',color:'#0e1116'}).setOrigin(0.5);
    btn.add([bg,this.panelBtnText]); btn.setSize(bw,bh).setInteractive(new Phaser.Geom.Rectangle(-bw/2,-bh/2,bw,bh),Phaser.Geom.Rectangle.Contains);
    btn.on('pointerdown',()=>{ this.panel.setVisible(false); if(this.panelEnded) newGame(); else newHand(); });
    this.panel.add([g,this.panelTitle,this.panelBody,btn]);
  }

  // ---- engine callbacks ----
  onNewHand(){
    this.panel.setVisible(false);
    for(const c of this.comm){ c.set(null); c._shown=false; }
    this.refresh();
    if(this.noAnim) return;
    // robust deal: cards sit at their seat, scale/fade in (position is always correct)
    this.seats.forEach((seat,i)=>{ [seat.c1,seat.c2].forEach((c,k)=>{ if(!c.visible)return;
      c.setScale(0.7).setAlpha(0); this.tweens.add({targets:c,scale:1,alpha:1,duration:260,delay:(i*2+k)*60,ease:'Back.out'}); }); });
  }
  onCommunity(){
    this.refresh();
    if(this.noAnim) return;
    for(let i=0;i<5;i++){ const c=this.comm[i];
      if(i<community.length && !c._shown){ c._shown=true; c.setScale(0.6).setAlpha(0); this.tweens.add({targets:c,scale:1,alpha:1,duration:260,delay:i*60,ease:'Back.out'}); }
      if(i>=community.length) c._shown=false;
    }
  }
  flashAction(i){ const seat=this.seats[i]; this.tweens.add({targets:seat.cont,scale:{from:1.04,to:1},duration:180}); }

  refresh(){
    document.getElementById('rotate'); // noop ref
    this.potText.setText('Pot  '+pot());
    for(let i=0;i<5;i++) this.comm[i].set(i<community.length?community[i]:null, true);
    this.seats.forEach((seat,i)=>{
      const p=players[i], turn=(toAct===i)&&p.inHand&&!p.folded&&notFolded()>1&&able()>0;
      const showFace=(i===0)||(revealAll&&!p.folded);
      seat.c1.set(p.inHand?p.hole[0]:null, showFace, p.folded); seat.c2.set(p.inHand?p.hole[1]:null, showFace, p.folded);
      seat.name.setText(i===0?'You':p.name).setColor(turn?'#5ad1c5':(p.folded?'#5b6577':'#cdd6e3'));
      let info=''; let col='#9aa3b2';
      if(p.bet>0){ info='bet '+p.bet; col='#d8b25a'; }
      else if(p.last&&!revealAll){ info=p.last; col=turn?'#5ad1c5':'#7c879c'; }
      else info='▮ '+p.stack;
      seat.info.setText(p.inHand?info:'out').setColor(col);
      // dealer button toward table center
      const side=seat.x>DW/2?-1:1, dx=side*(seat.cw+18), dy=0;
      seat.dealer.setVisible(i===button).setPosition(dx,dy); seat.dtext.setVisible(i===button).setPosition(dx,dy);
      // turn ring
      seat.ring.clear();
      if(turn){ seat.ring.lineStyle(3,ACCENT,1); seat.ring.strokeRoundedRect(-(seat.cw+10),-(seat.ch/2+14),(seat.cw+10)*2,seat.ch+ (seat.above?56:54),12); }
    });
  }

  setStatus(){}
  enableControls(){
    const p=players[0], cc=currentBet-p.bet;
    this.showBtn('fold',true); this.showBtn('call',true);
    this.btns.call.label.setText(cc<=0?'Check':('Call '+Math.min(cc,p.stack)));
    const canRaise=able()>1 && p.stack>Math.max(0,cc);
    const potNow=pot();
    this.raiseAmt={ half:Math.min(p.bet+p.stack, currentBet+Math.max(minRaise,Math.round(potNow*0.5))),
                    potb:Math.min(p.bet+p.stack, currentBet+Math.max(minRaise,potNow)),
                    allin:p.bet+p.stack };
    this.showBtn('half',canRaise && this.raiseAmt.half<this.raiseAmt.allin);
    this.showBtn('potb',canRaise && this.raiseAmt.potb<this.raiseAmt.allin);
    this.showBtn('allin',canRaise);
  }
  disableControls(){ for(const k in this.btns) this.showBtn(k,false); }
  showBtn(k,on){ const b=this.btns[k]; if(!b)return; b.setVisible(on); b.input&&(b.input.enabled=on); b.setAlpha(on?1:0.001); }
  onBtn(k){
    if(busy||toAct!==0) return;
    const p=players[0], cc=currentBet-p.bet;
    let act;
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
    this.panelBtnText.setText(ended?'New game':'Next hand'); this.panel.setVisible(true).setScale(0.9); this.tweens.add({targets:this.panel,scale:1,duration:200,ease:'Back.out'}); }
  showOver(t){ this.showResult(t,'',true); }
}

new Phaser.Game({
  type: Phaser.AUTO, backgroundColor:'#0e1116',
  scale:{ mode:Phaser.Scale.FIT, autoCenter:Phaser.Scale.CENTER_BOTH, parent:'game', width:DW, height:DH },
  scene:[Table]
});
