import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { heroForState } from '../shared/heroData';
import {
  captureSlotKeys,
  captureTargetForState,
  defaultCaptureSlots,
  normalizeCaptureSlots,
  slotMeta,
  slotsFromLegacyZones,
  type CaptureSlotKey,
  type CaptureSlots,
  type LegacyCaptureZones,
} from './bpCaptureLayout';
import { detectEmptyBan, EMPTY_BAN_GRACE_MS, type EmptyBanStability } from './emptyBanDetection';
import { updateHeroRecognitionStability, type HeroRecognitionStability } from './heroRecognitionStability';
import { captureAspectRatioDrift, fitCapturePreview, regionFromDrag, regionToPixels, type PreviewSize } from './windowCaptureGeometry';
import { phaseName } from '../shared/display';
import { translator } from '../shared/i18n';
import { phases, type Action, type MatchState } from '../shared/types';

type CaptureResult = {
  kind: 'hero' | 'empty-ban';
  candidates: { heroId:number; confidence:number }[];
  preview: string;
  at: number;
  phaseKey: string;
  revision: number;
};

type CaptureMode = 'window' | 'native';

type WindowInfo = {
  label:string;
  surface:string;
  width:number;
  height:number;
};

type RecognitionResponse = {
  candidates?: {heroId:number;confidence:number}[];
  preview:string;
  fingerprint?:string;
};

const freshEmptyStability = (): EmptyBanStability => ({ phaseKey:'', fingerprint:'', count:0 });
const freshHeroStability = (): HeroRecognitionStability => ({ phaseKey:'', heroId:null, count:0 });
const nativeDefault = {x:0,y:0,width:100,height:100};
const SLOTS_STORAGE='lol-window-capture-slots-v3';
const PROFILE_STORAGE='lol-window-capture-profile-v1';
const LEGACY_ZONES_STORAGE='lol-window-capture-zones-v2';

type CaptureProfile={width:number;height:number;savedAt:number};

function readCaptureProfile():CaptureProfile|undefined {
  try {
    const value=JSON.parse(localStorage.getItem(PROFILE_STORAGE)||'null') as CaptureProfile|null;
    if(value&&Number.isFinite(value.width)&&Number.isFinite(value.height)&&value.width>0&&value.height>0) return value;
  } catch { /* ignore invalid saved metadata */ }
  return undefined;
}

function readCaptureSlots() {
  try {
    const value=JSON.parse(localStorage.getItem(SLOTS_STORAGE)||'null');
    if(value&&typeof value==='object') return normalizeCaptureSlots(value);
  } catch { /* use migration/defaults */ }

  try {
    const legacy=JSON.parse(localStorage.getItem(LEGACY_ZONES_STORAGE)||'null') as LegacyCaptureZones|null;
    if(legacy&&typeof legacy==='object'&&legacy.bluePick&&legacy.redPick&&legacy.blueBan&&legacy.redBan) {
      return normalizeCaptureSlots(slotsFromLegacyZones(legacy));
    }
  } catch { /* use defaults */ }

  return normalizeCaptureSlots(defaultCaptureSlots);
}

function pointInElement(event:React.PointerEvent<HTMLElement>) {
  const rect=event.currentTarget.getBoundingClientRect();
  return {
    x:Math.min(1,Math.max(0,(event.clientX-rect.left)/Math.max(rect.width,1))),
    y:Math.min(1,Math.max(0,(event.clientY-rect.top)/Math.max(rect.height,1))),
  };
}

function percentageStyle(region:{x:number;y:number;width:number;height:number}) {
  return {
    left:`${region.x*100}%`,
    top:`${region.y*100}%`,
    width:`${region.width*100}%`,
    height:`${region.height*100}%`,
  };
}

export function ScreenInput({ state, revision, token, disabled, send }: { state:MatchState; revision:number; token:string; disabled:boolean; send:(action:Action)=>void }) {
  const zh=state.language==='zh';
  const t=translator(state.language);
  const [captureMode,setCaptureMode]=useState<CaptureMode>(()=>{
    const saved=localStorage.getItem('lol-capture-mode');
    return saved==='native'?'native':'window';
  });
  const [nativeRegion,setNativeRegion]=useState(()=>{
    try { return JSON.parse(localStorage.getItem('lol-capture-region')||'null')||nativeDefault; } catch { return nativeDefault; }
  });
  const [slots,setSlots]=useState<CaptureSlots>(readCaptureSlots);
  const [autoWatch,setAutoWatch]=useState(()=>localStorage.getItem('lol-capture-auto-watch')==='1');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [candidateStatus,setCandidateStatus]=useState('');
  const [result,setResult]=useState<CaptureResult>();
  const [selected,setSelected]=useState(0);
  const [windowInfo,setWindowInfo]=useState<WindowInfo>();
  const [calibratingSlot,setCalibratingSlot]=useState<CaptureSlotKey>();
  const [videoReady,setVideoReady]=useState(false);
  const [previewSize,setPreviewSize]=useState<PreviewSize>({width:0,height:0});

  const dialog=useRef<HTMLDialogElement>(null);
  const videoRef=useRef<HTMLVideoElement>(null);
  const previewHostRef=useRef<HTMLDivElement>(null);
  const streamRef=useRef<MediaStream>();
  const mounted=useRef(true);
  const busyRef=useRef(false);
  const dragStart=useRef<{x:number;y:number}|null>(null);
  const emptyStability=useRef<EmptyBanStability>(freshEmptyStability());
  const heroStability=useRef<HeroRecognitionStability>(freshHeroStability());
  const phaseStartedAt=useRef(Date.now());
  const emptyPromptedPhase=useRef('');

  const phase=phases(state.draftMode,state.firstPickSide)[state.currentPhase];
  const phaseKey=`${state.draftGameNumber ?? state.gameNumber}:${state.currentPhase}:${phase?.team ?? 'done'}:${phase?.action ?? 'done'}`;
  const latestCaptureContext=useRef({phaseKey,revision});
  latestCaptureContext.current={phaseKey,revision};
  const target=useMemo(()=>captureTargetForState(state,slots),[state,slots]);

  const label=useCallback((id:number)=>{
    const hero=heroForState(state,id);
    return zh?hero?.chineseName??String(id):hero?.englishName??String(id);
  },[state,zh]);

  const captureSlotLabel=useCallback((key:CaptureSlotKey)=>{
    const meta=slotMeta(key);
    return t('captureExplicitSlot',{
      side:t(meta.side==='blue'?'blueSide':'redSide'),
      action:t(meta.action==='ban'?'banAction':'pickAction'),
      number:meta.index+1,
    });
  },[t]);

  const stopWindowCapture=useCallback(()=>{
    const stream=streamRef.current;
    streamRef.current=undefined;
    if(stream) stream.getTracks().forEach(track=>track.stop());
    if(videoRef.current) videoRef.current.srcObject=null;
    setVideoReady(false);
    setWindowInfo(undefined);
    setCalibratingSlot(undefined);
  },[]);

  useEffect(()=>{
    mounted.current=true;
    return()=>{
      mounted.current=false;
      const stream=streamRef.current;
      if(stream) stream.getTracks().forEach(track=>track.stop());
    };
  },[]);

  useEffect(()=>{
    emptyStability.current=freshEmptyStability();
    heroStability.current=freshHeroStability();
    phaseStartedAt.current=Date.now();
    emptyPromptedPhase.current='';
    setResult(undefined);
    setMessage('');
    setCandidateStatus('');
  },[phaseKey]);

  useEffect(()=>{
    if(!result||!dialog.current||dialog.current.open) return;
    dialog.current.showModal();
  },[result]);

  const connectWindow=useCallback(async()=>{
    if(!navigator.mediaDevices?.getDisplayMedia){
      setMessage(t('windowCaptureUnsupported'));
      return;
    }
    try{
      stopWindowCapture();
      setMessage('');
      const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
      if(!mounted.current){
        stream.getTracks().forEach(track=>track.stop());
        return;
      }
      streamRef.current=stream;
      const video=videoRef.current;
      if(!video) throw new Error('Preview unavailable');
      video.srcObject=stream;
      video.muted=true;
      await video.play();
      if(video.readyState<1){
        await new Promise<void>((resolve,reject)=>{
          const timer=setTimeout(()=>reject(new Error('Capture metadata timeout')),5000);
          video.addEventListener('loadedmetadata',()=>{clearTimeout(timer);resolve();},{once:true});
        });
      }
      const track=stream.getVideoTracks()[0];
      const settings=track.getSettings();
      setWindowInfo({
        label:track.label||t('windowCaptureConnected'),
        surface:String(settings.displaySurface||'window'),
        width:video.videoWidth||settings.width||0,
        height:video.videoHeight||settings.height||0,
      });
      setVideoReady(true);
      track.addEventListener('ended',()=>{
        if(!mounted.current) return;
        streamRef.current=undefined;
        setVideoReady(false);
        setWindowInfo(undefined);
        setCalibratingSlot(undefined);
        setMessage(t('windowCaptureEnded'));
      },{once:true});
      setMessage(t('windowCaptureConnected'));
    }catch(error){
      stopWindowCapture();
      if(!mounted.current) return;
      const denied=error instanceof DOMException&&['NotAllowedError','AbortError'].includes(error.name);
      setMessage(denied?t('windowCaptureCancelled'):t('windowCaptureFailed'));
    }
  },[stopWindowCapture,t]);

  const captureWindowFrame=useCallback(()=>{
    const video=videoRef.current;
    if(!videoReady||!video||!video.videoWidth||!video.videoHeight) throw new Error(t('windowCaptureNotConnected'));
    if(!target) throw new Error(t('captureNoActiveSlot'));
    const pixels=regionToPixels(target.region,video.videoWidth,video.videoHeight);
    const maxSide=384;
    const scale=Math.min(1,maxSide/Math.max(pixels.width,pixels.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(32,Math.round(pixels.width*scale));
    canvas.height=Math.max(32,Math.round(pixels.height*scale));
    const context=canvas.getContext('2d');
    if(!context) throw new Error('Canvas unavailable');
    context.imageSmoothingEnabled=true;
    context.imageSmoothingQuality='high';
    context.drawImage(
      video,
      pixels.x,pixels.y,pixels.width,pixels.height,
      0,0,canvas.width,canvas.height,
    );
    return canvas.toDataURL('image/jpeg',.9);
  },[target,t,videoReady]);

  const capture=useCallback(async()=>{
    if(busyRef.current||disabled||!phase||state.committedGameId) return;
    busyRef.current=true;
    setBusy(true);
    setMessage('');
    try{
      let data:RecognitionResponse;
      if(captureMode==='window'){
        const image=captureWindowFrame();
        const response=await fetch('/api/recognize-frame',{
          method:'POST',
          headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
          body:JSON.stringify({image,revision}),
          signal:AbortSignal.timeout(25000),
        });
        data=await response.json();
        if(!response.ok) throw new Error(t('windowCaptureRecognitionFailed'));
      }else{
        localStorage.setItem('lol-capture-region',JSON.stringify(nativeRegion));
        const response=await fetch('/api/capture',{
          method:'POST',
          headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
          body:JSON.stringify({region:nativeRegion,revision}),
          signal:AbortSignal.timeout(25000),
        });
        data=await response.json();
        if(!response.ok) throw new Error(zh?'识别不可用：请使用 Windows 本机控制台、启用采集并检查区域。可继续手动选择。':'Capture unavailable: use the enabled Windows local console and check the region. Manual selection remains available.');
      }
      if(!mounted.current) return;

      const candidates=data.candidates??[];
      const heroEvidence=updateHeroRecognitionStability(heroStability.current,phaseKey,candidates);
      heroStability.current=heroEvidence.stability;
      const top=heroEvidence.top;
      const elapsedMs=Date.now()-phaseStartedAt.current;
      const empty=detectEmptyBan(emptyStability.current,{
        phaseKey,
        isBan:phase.action==='ban',
        fingerprint:data.fingerprint,
        topConfidence:top?.confidence,
        elapsedMs,
        suppressed:emptyPromptedPhase.current===phaseKey,
      });
      emptyStability.current=empty.stability;

      if(heroEvidence.accepted&&top){
        setSelected(top.heroId);
        setCandidateStatus(t('captureHeroStable',{
          hero:label(top.heroId),
          confidence:Math.round(top.confidence*100),
          count:heroEvidence.stability.count,
        }));
        setResult({kind:'hero',candidates,preview:data.preview,at:Date.now()});
        return;
      }

      if(top){
        setCandidateStatus(t('captureHeroCandidate',{
          hero:label(top.heroId),
          confidence:Math.round(top.confidence*100),
          count:heroEvidence.stability.count,
        }));
      }else{
        setCandidateStatus(t('captureNoCandidate'));
      }

      if(empty.suspected){
        emptyPromptedPhase.current=phaseKey;
        setResult({kind:'empty-ban',candidates,preview:data.preview,at:Date.now()});
        setMessage(t('emptyBanSuspected',{count:3}));
        return;
      }

      if(phase.action==='ban'&&empty.waitingForGracePeriod){
        const remaining=Math.max(0,Math.ceil((EMPTY_BAN_GRACE_MS-elapsedMs)/1000));
        setMessage(t('emptyBanGraceWaiting',{seconds:remaining}));
      }else if(phase.action==='ban'&&emptyPromptedPhase.current===phaseKey){
        setMessage(t('emptyBanSuppressed'));
      }else if(phase.action==='ban'&&(top?.confidence??0)<.35){
        setMessage(t('emptyBanSuspected',{count:empty.stability.count}));
      }else{
        setMessage(t('captureWaitingForStableHero'));
      }
    }catch(error){
      if(mounted.current) setMessage(error instanceof Error?error.message:'Capture failed');
    }finally{
      busyRef.current=false;
      if(mounted.current) setBusy(false);
    }
  },[captureMode,captureWindowFrame,disabled,label,nativeRegion,phase,phaseKey,revision,state.committedGameId,t,token,zh]);

  useEffect(()=>{
    if(!autoWatch||result||disabled||!phase||state.committedGameId) return;
    if(captureMode==='window'&&!videoReady) return;
    const timer=setTimeout(()=>{void capture();},busy?800:1400);
    return()=>clearTimeout(timer);
  },[autoWatch,busy,capture,captureMode,disabled,phase,result,state.committedGameId,videoReady]);

  const setMode=(mode:CaptureMode)=>{
    setCaptureMode(mode);
    localStorage.setItem('lol-capture-mode',mode);
    emptyStability.current=freshEmptyStability();
    heroStability.current=freshHeroStability();
    setResult(undefined);
    setMessage('');
    setCandidateStatus('');
  };

  const pointerDown=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(!calibratingSlot||!videoReady) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current=pointInElement(event);
  };

  const pointerMove=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(!calibratingSlot||!dragStart.current) return;
    const next=regionFromDrag(dragStart.current,pointInElement(event));
    setSlots(previous=>({...previous,[calibratingSlot]:next}));
  };

  const pointerUp=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(!calibratingSlot||!dragStart.current) return;
    const next=regionFromDrag(dragStart.current,pointInElement(event));
    dragStart.current=null;
    const updated={...slots,[calibratingSlot]:next};
    setSlots(updated);
    localStorage.setItem(SLOTS_STORAGE,JSON.stringify(updated));
    setMessage(t('captureExplicitSlotSaved',{slot:captureSlotLabel(calibratingSlot)}));
    setCalibratingSlot(undefined);
  };

  const closeReview=()=>{
    if(dialog.current?.open) dialog.current.close();
    setResult(undefined);
  };

  const submitReview=()=>{
    if(!phase||disabled||!result) return;
    if(Date.now()-result.at>30000){
      closeReview();
      setMessage(zh?'结果已过期，请重新读取。':'Result expired. Capture again.');
      return;
    }
    closeReview();
    if(result.kind==='empty-ban') send({type:'skip_ban',team:phase.team});
    else send({type:'draft_action',heroId:selected,team:phase.team,action:phase.action});
  };

  const currentSlotText=target
    ? t('captureCurrentSlot',{
      side:t(target.side==='blue'?'blueSide':'redSide'),
      action:t(target.action==='ban'?'banAction':'pickAction'),
      current:target.slotIndex+1,
      total:target.slotCount,
    })
    : t('draftComplete');

  const renderSlotButtons=(side:'blue'|'red',action:'ban'|'pick')=>{
    const count=5;
    return <div className={`explicit-slot-group ${side} ${action}`}>
      <strong>{t(side==='blue'?'blueSide':'redSide')} · {t(action==='ban'?'banAction':'pickAction')}</strong>
      <div className="explicit-slot-buttons">{Array.from({length:count},(_,index)=>{
        const key=`${side}${action==='ban'?'Ban':'Pick'}${index+1}` as CaptureSlotKey;
        return <button
          type="button"
          key={key}
          disabled={!videoReady}
          className={[
            calibratingSlot===key?'selected':'',
            target?.key===key?'active':'',
          ].filter(Boolean).join(' ')}
          onClick={()=>setCalibratingSlot(current=>current===key?undefined:key)}
        >{action==='ban'?'B':'P'}{index+1}</button>;
      })}</div>
    </div>;
  };

  return <section className="panel screen-input">
    <div className="screen-input-heading">
      <div>
        <h2>{zh?'自动 BP · 屏幕识别':'Auto BP · screen recognition'}</h2>
        <p>{t('captureExplicitSlotsHint')}</p>
      </div>
      <div className="capture-mode-switch" role="group" aria-label={t('captureSource')}>
        <button type="button" className={captureMode==='window'?'selected':''} onClick={()=>setMode('window')}>{t('windowCaptureMode')}</button>
        <button type="button" className={captureMode==='native'?'selected':''} onClick={()=>setMode('native')}>{t('nativeCaptureMode')}</button>
      </div>
    </div>

    {captureMode==='window'?<div className="window-capture">
      <div className="window-capture-toolbar">
        <button type="button" className="primary" disabled={disabled} onClick={()=>void connectWindow()}>{videoReady?t('windowCaptureChange'):t('windowCaptureChoose')}</button>
        {videoReady&&<button type="button" onClick={stopWindowCapture}>{t('windowCaptureDisconnect')}</button>}
        <span className={videoReady?'window-capture-status connected':'window-capture-status'}>{videoReady?'●':'○'} {windowInfo?.label||t('windowCaptureDisconnected')}</span>
      </div>

      <div
        className={`window-capture-preview ${videoReady?'ready':''} ${calibratingSlot?'calibrating':''}`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={()=>{dragStart.current=null;}}
      >
        <video ref={videoRef} playsInline muted />
        {videoReady&&captureSlotKeys.map(key=><div
          key={key}
          className={`capture-explicit-slot ${key.startsWith('blue')?'blue':'red'} ${key.includes('Ban')?'ban':'pick'} ${target?.key===key?'active':''} ${calibratingSlot===key?'editing':''}`}
          style={percentageStyle(slots[key])}
        ><span>{captureSlotLabel(key)}</span></div>)}
        {!videoReady&&<div className="window-capture-placeholder">{t('windowCaptureChooseHint')}</div>}
      </div>

      <div className="explicit-slot-calibration">
        <div className="explicit-slot-calibration-heading">
          <div>
            <strong>{t('captureCalibrateExplicitSlots')}</strong>
            <p className="muted">{calibratingSlot?t('captureDragSelectedSlot',{slot:captureSlotLabel(calibratingSlot)}):t('captureExplicitCalibrationHint')}</p>
          </div>
          <button type="button" disabled={!videoReady} onClick={()=>{
            const next=normalizeCaptureSlots(defaultCaptureSlots);
            setSlots(next);
            localStorage.setItem(SLOTS_STORAGE,JSON.stringify(next));
            setCalibratingSlot(undefined);
            setMessage(t('captureExplicitSlotsReset'));
          }}>{t('captureResetAllSlots')}</button>
        </div>

        <div className="explicit-slot-groups">
          {renderSlotButtons('blue','ban')}
          {renderSlotButtons('red','ban')}
          {renderSlotButtons('blue','pick')}
          {renderSlotButtons('red','pick')}
        </div>
      </div>

      <p className="muted">{videoReady&&windowInfo?`${windowInfo.width}×${windowInfo.height} · ${windowInfo.surface} · ${t('windowCaptureRelativeHint')}`:t('windowCaptureRelativeHint')}</p>
    </div>:<details className="native-capture-settings" open>
      <summary>{t('nativeCaptureAdvanced')}</summary>
      <p className="muted">{t('nativeCaptureHint')}</p>
      <div className="capture-region">{(['x','y','width','height'] as const).map(key=><label key={key}>{key}<input type="number" value={nativeRegion[key]} onChange={event=>setNativeRegion({...nativeRegion,[key]:Number(event.target.value)})}/></label>)}</div>
    </details>}

    <div className="capture-live-status">
      <div><span>{t('capturePhaseLabel')}</span><strong>{phaseName(state)}</strong></div>
      <div><span>{t('captureSlotLabel')}</span><strong>{currentSlotText}</strong></div>
      <div><span>{t('captureCandidateLabel')}</span><strong>{candidateStatus||t('captureWaiting')}</strong></div>
      <div><span>{t('captureEmptyBanLabel')}</span><strong>{
        phase?.action!=='ban'
          ? t('captureNotApplicable')
          : emptyPromptedPhase.current===phaseKey
            ? t('capturePromptedOnce')
            : t('captureGraceThenCheck',{seconds:Math.max(0,Math.ceil((EMPTY_BAN_GRACE_MS-(Date.now()-phaseStartedAt.current))/1000))})
      }</strong></div>
    </div>

    <div className="screen-input-actions">
      <button disabled={disabled||busy||!phase||!!state.committedGameId||(captureMode==='window'&&!videoReady)} onClick={()=>void capture()}>{busy?(zh?'正在识别…':'Recognizing…'):t('captureNow')}</button>
      {phase?.action==='ban'&&<button className="empty-ban-button" disabled={disabled||!!state.committedGameId} onClick={()=>send({type:'skip_ban',team:phase.team})}>{t('emptyBanButton')}</button>}
      <label className="auto-watch-toggle"><input type="checkbox" checked={autoWatch} onChange={event=>{
        setAutoWatch(event.target.checked);
        localStorage.setItem('lol-capture-auto-watch',event.target.checked?'1':'0');
      }}/>{t('autoCaptureWatch')}</label>
    </div>
    <small>{captureMode==='window'?t('captureExplicitAutoHint'):t('autoCaptureWatchHint')}</small>
    <p role="status">{message}</p>

    {result&&<dialog ref={dialog} className="library-dialog capture-review" aria-label={result.kind==='empty-ban'?t('emptyBanReviewTitle'):(zh?'确认识别结果':'Review recognition')} onCancel={event=>{event.preventDefault();closeReview();}}>
      {result.kind==='empty-ban'?<>
        <h2>{t('emptyBanReviewTitle')}</h2>
        <p>{t('emptyBanReviewHintOnce')}</p>
      </>:<>
        <h2>{zh?'识别到：':'Recognized: '}{label(selected)}</h2>
        <label>{zh?'候选英雄（相似度，不代表准确率）':'Candidates (similarity, not accuracy)'}<select value={selected} onChange={event=>setSelected(Number(event.target.value))}>{result.candidates.map(candidate=><option key={candidate.heroId} value={candidate.heroId}>{label(candidate.heroId)} · {Math.round(candidate.confidence*100)}%</option>)}</select></label>
      </>}
      <p>{currentSlotText}</p>
      <img src={result.preview} alt={zh?'当前槽位截图':'Current slot capture'}/>
      <div className="capture-review-actions">
        <button disabled={disabled||!phase} onClick={submitReview}>{result.kind==='empty-ban'?t('emptyBanConfirm'):(zh?'确认并提交':'Confirm and submit')}</button>
        <button onClick={closeReview}>{zh?'拒绝 / 继续监视':'Reject / keep watching'}</button>
      </div>
    </dialog>}
  </section>;
}
