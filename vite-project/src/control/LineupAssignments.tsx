import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { heroForState } from '../shared/heroData';
import type { Action, MatchState, Side } from '../shared/types';

interface Region { x:number; y:number; width:number; height:number }
interface Candidate { heroId:number; confidence:number }
interface SlotResult {
  side: Side;
  playerIndex: number;
  preview: string;
  candidates: Candidate[];
}
interface SolvedTeam {
  heroes: number[];
  confidence: number[];
  average: number;
  minimum: number;
}

const emptyRegions = () => Array.from({length:10},()=>({x:0,y:0,width:0,height:0}));

function permutations(values:number[]):number[][] {
  if (values.length <= 1) return [values];
  return values.flatMap((value,index) =>
    permutations([...values.slice(0,index),...values.slice(index+1)]).map(rest=>[value,...rest]));
}

function solveTeam(slots:SlotResult[], picks:number[]):SolvedTeam | undefined {
  if (slots.length !== 5 || picks.length !== 5) return;
  let best: SolvedTeam | undefined;
  for (const order of permutations(picks)) {
    const confidence = order.map((heroId,index) =>
      slots[index].candidates.find(candidate=>candidate.heroId===heroId)?.confidence ?? -1);
    if (confidence.some(value=>value < 0)) continue;
    const average = confidence.reduce((sum,value)=>sum+value,0)/confidence.length;
    const minimum = Math.min(...confidence);
    if (!best || average > best.average) best={heroes:order,confidence,average,minimum};
  }
  return best;
}

function sameLineup(a:Array<number|null>, b:number[]) {
  return a.length === b.length && a.every((value,index)=>value===b[index]);
}

function label(state:MatchState,id:number|null|undefined) {
  if (!id) return '—';
  const hero=heroForState(state,id);
  return state.language==='zh' ? hero?.chineseName ?? '—' : hero?.englishName ?? '—';
}

export function LineupAssignments({
  state, revision, token, disabled, send,
}:{
  state:MatchState;
  revision:number;
  token:string;
  disabled:boolean;
  send:(action:Action)=>void;
}) {
  const zh=state.language==='zh';
  const [regions,setRegions]=useState<Region[]>(()=>{
    try {
      const stored=JSON.parse(localStorage.getItem('lol-lineup-regions')||'null');
      return Array.isArray(stored)&&stored.length===10 ? stored : emptyRegions();
    } catch { return emptyRegions(); }
  });
  const [auto,setAuto]=useState(()=>localStorage.getItem('lol-lineup-auto')==='1');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [results,setResults]=useState<SlotResult[]>([]);
  const mounted=useRef(true);
  const applying=useRef('');
  const stableRef=useRef({signature:'',count:0});
  const busyRef=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);

  const blueResults=results.filter(slot=>slot.side==='blue').sort((a,b)=>a.playerIndex-b.playerIndex);
  const redResults=results.filter(slot=>slot.side==='red').sort((a,b)=>a.playerIndex-b.playerIndex);
  const blueSolved=useMemo(()=>solveTeam(blueResults,state.bluePicks),[blueResults,state.bluePicks]);
  const redSolved=useMemo(()=>solveTeam(redResults,state.redPicks),[redResults,state.redPicks]);
  const regionsReady=regions.every(region=>Number.isInteger(region.x)&&Number.isInteger(region.y)&&region.width>=32&&region.height>=32);

  const applyLineups=useCallback((blue:number[],red:number[])=>{
    if (disabled || state.committedGameId) return;
    send({type:'set_lineup_assignments',blue,red});
  },[disabled,state.committedGameId,send]);

  const scan=useCallback(async()=>{
    if (busyRef.current || disabled || !state.draftComplete || state.committedGameId || state.bpInputMode!=='screen') return;
    if (!regionsReady) { setMessage(zh?'请先配置双方 10 个玩家英雄槽位。':'Configure all ten player hero regions first.'); return; }
    busyRef.current=true;
    setBusy(true);
    try {
      localStorage.setItem('lol-lineup-regions',JSON.stringify(regions));
      const response=await fetch('/api/capture-lineup',{
        method:'POST',
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
        body:JSON.stringify({regions,revision}),
        signal:AbortSignal.timeout(25000),
      });
      const data=await response.json();
      if(!response.ok) throw new Error(zh?'阵容识别失败，请检查游戏画面与识别区域。':'Lineup recognition failed. Check the game screen and regions.');
      if(!mounted.current) return;
      const slots=(data.slots||[]) as SlotResult[];
      setResults(slots);
      const blue=solveTeam(slots.filter(slot=>slot.side==='blue').sort((a,b)=>a.playerIndex-b.playerIndex),state.bluePicks);
      const red=solveTeam(slots.filter(slot=>slot.side==='red').sort((a,b)=>a.playerIndex-b.playerIndex),state.redPicks);
      if(!blue||!red) {
        stableRef.current={signature:'',count:0};
        setMessage(zh?'暂时无法唯一确认 10 个英雄，请保持 BP 画面可见或手动校正。':'Could not uniquely resolve all ten heroes yet. Keep the BP screen visible or correct manually.');
        return;
      }
      const signature=`${blue.heroes.join(',')}|${red.heroes.join(',')}`;
      const previousStable=stableRef.current;
      const nextCount=previousStable.signature===signature ? previousStable.count+1 : 1;
      stableRef.current={signature,count:nextCount};
      const highConfidence=blue.minimum>=.72&&red.minimum>=.72&&blue.average>=.82&&red.average>=.82;
      setMessage(zh
        ? `识别完成 · 蓝方平均 ${Math.round(blue.average*100)}% · 红方平均 ${Math.round(red.average*100)}% · 稳定 ${nextCount}/3`
        : `Recognized · blue avg ${Math.round(blue.average*100)}% · red avg ${Math.round(red.average*100)}% · stable ${nextCount}/3`);
      if(auto&&highConfidence&&nextCount>=3&&applying.current!==signature
        &&(!sameLineup(state.blueAssignments,blue.heroes)||!sameLineup(state.redAssignments,red.heroes))) {
        applying.current=signature;
        applyLineups(blue.heroes,red.heroes);
      }
    } catch(error) {
      if(mounted.current) setMessage(error instanceof Error?error.message:'Capture failed');
    } finally {
      busyRef.current=false;
      if(mounted.current) setBusy(false);
    }
  },[auto,applyLineups,disabled,regions,regionsReady,revision,state,token,zh]);

  useEffect(()=>{
    if(!auto||state.bpInputMode!=='screen'||!state.draftComplete||state.committedGameId||disabled) return;
    const timer=setInterval(()=>{void scan();},2500);
    void scan();
    return()=>clearInterval(timer);
  },[auto,disabled,scan,state.bpInputMode,state.committedGameId,state.draftComplete]);

  if(!state.draftComplete||state.committedGameId) return null;

  const current=(side:Side)=>state[`${side}Assignments`] as Array<number|null>;
  const picked=(side:Side)=>state[`${side}Picks`];
  const change=(side:Side,index:number,heroId:number)=>{
    const blue=[...state.blueAssignments] as Array<number|null>;
    const red=[...state.redAssignments] as Array<number|null>;
    const assignments=side==='blue'?blue:red;
    const other=assignments.indexOf(heroId);
    if(other<0||assignments[index]===heroId) return;
    [assignments[index],assignments[other]]=[assignments[other],assignments[index]];
    if(blue.some(value=>value===null)||red.some(value=>value===null)) return;
    applyLineups(blue as number[],red as number[]);
  };
  const resultFor=(side:Side,index:number)=>results.find(result=>result.side===side&&result.playerIndex===index);

  return <section className="panel lineup-sync">
    <div className="lineup-sync-head">
      <div>
        <h2>{zh?'最终阵容归属 / 帮抢换英雄':'Final lineup ownership / hero swaps'}</h2>
        <p className="muted">{zh?'选角顺序不会再决定选手英雄。直播画面与 Player BP 历史以这里的最终归属为准。':'Pick order no longer decides player ownership. Broadcast cards and Player BP history use this final lineup.'}</p>
      </div>
      <button disabled={disabled} onClick={()=>applyLineups([...state.bluePicks],[...state.redPicks])}>{zh?'按选角顺序重置':'Reset to pick order'}</button>
    </div>

    <div className="lineup-team-grid">
      {(['blue','red'] as const).map(side=><section className={`lineup-team ${side}`} key={side}>
        <h3>{state[`${side}Team`].name}</h3>
        {state[`${side}Team`].players.map((player,index)=>{
          const detected=resultFor(side,index);
          const top=detected?.candidates[0];
          return <div className="lineup-player-row" key={index}>
            <span className="lineup-player-name">{player||`${zh?'选手':'Player'} ${index+1}`}</span>
            <select aria-label={`${player||`Player ${index+1}`} hero`} disabled={disabled} value={current(side)[index]??''} onChange={event=>change(side,index,Number(event.target.value))}>
              {picked(side).map(heroId=><option key={heroId} value={heroId}>{label(state,heroId)}</option>)}
            </select>
            <span className="lineup-detected">{top ? `${label(state,top.heroId)} ${Math.round(top.confidence*100)}%` : '—'}</span>
          </div>;
        })}
      </section>)}
    </div>

    {state.bpInputMode==='screen'&&<div className="lineup-auto">
      <div className="lineup-auto-toolbar">
        <label><input type="checkbox" checked={auto} onChange={event=>{setAuto(event.target.checked);localStorage.setItem('lol-lineup-auto',event.target.checked?'1':'0');}} /> {zh?'BP 完成后自动同步最终阵容':'Auto-sync final lineup after draft'}</label>
        <button disabled={disabled||busy||!regionsReady} onClick={()=>void scan()}>{busy?(zh?'正在扫描…':'Scanning…'):(zh?'立即扫描 10 个槽位':'Scan all 10 slots')}</button>
        {blueSolved&&redSolved&&<button disabled={disabled} onClick={()=>applyLineups(blueSolved.heroes,redSolved.heroes)}>{zh?'应用本次识别':'Apply this scan'}</button>}
      </div>
      <p role="status" className="lineup-status">{message|| (zh?'高置信度阵容连续稳定 3 次后自动更新；识别错误不会改变 Pick/Ban 历史。':'High-confidence lineup must stay identical for 3 scans before auto-apply. Recognition never changes Pick/Ban history.')}</p>
      <details className="lineup-regions">
        <summary>{zh?'高级：配置 10 个玩家英雄槽位':'Advanced: configure 10 player hero regions'}</summary>
        <p className="muted">{zh?'坐标使用 Windows 物理像素；设置一次后会保存在本机浏览器。顺序为蓝方 1–5、红方 1–5。':'Coordinates use Windows physical pixels and are saved locally. Order: blue 1–5, red 1–5.'}</p>
        <div className="lineup-region-grid">{regions.map((region,index)=>{
          const side=index<5?'blue':'red',playerIndex=index%5;
          return <fieldset key={index}><legend>{zh?(side==='blue'?'蓝':'红'):(side==='blue'?'Blue':'Red')} {playerIndex+1}</legend>
            {(['x','y','width','height'] as const).map(key=><label key={key}>{key}<input type="number" value={region[key]} onChange={event=>setRegions(previous=>previous.map((item,i)=>i===index?{...item,[key]:Number(event.target.value)}:item))}/></label>)}
          </fieldset>;
        })}</div>
      </details>
    </div>}
  </section>;
}
