import { useCallback, useEffect, useState } from 'react';
import { apiURL } from '../shared/config';
import { heroForState } from '../shared/heroData';
import { translator } from '../shared/i18n';
import type { MatchState, Side } from '../shared/types';

type LcuStatus = {
  clientConnected: boolean;
  sessionActive: boolean;
  source?: 'env' | 'lockfile' | 'process';
  localSide?: Side;
  phase?: string;
  lastSyncAt?: number;
  lastError?: string;
  lastAction?: { side: Side; action: 'ban' | 'pick'; championId: number | null };
};

export function LcuInput({ state, token }: { state: MatchState; token: string }) {
  const t=translator(state.language);
  const [status,setStatus]=useState<LcuStatus>({clientConnected:false,sessionActive:false});
  const [loading,setLoading]=useState(false);

  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch(`${apiURL}/api/lcu/status`,{
        headers:{Authorization:`Bearer ${token}`},
        cache:'no-store',
        signal:AbortSignal.timeout(2500),
      });
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatus(await response.json() as LcuStatus);
    }catch(error){
      setStatus(previous=>({...previous,clientConnected:false,sessionActive:false,lastError:error instanceof Error?error.message:'LCU status unavailable'}));
    }finally{
      setLoading(false);
    }
  },[token]);

  useEffect(()=>{
    void refresh();
    const timer=setInterval(()=>{void refresh();},1000);
    return()=>clearInterval(timer);
  },[refresh]);

  const lastHero=status.lastAction?.championId
    ? heroForState(state,status.lastAction.championId)
    : undefined;
  const heroName=lastHero
    ? (state.language==='zh'?lastHero.chineseName:lastHero.englishName)
    : status.lastAction?.championId===null?t('emptyBanButton'):'—';

  return <section className="panel lcu-input">
    <div className="lcu-input-heading">
      <div>
        <h2>{t('lcuPanelTitle')}</h2>
        <p className="muted">{t('lcuPanelHint')}</p>
      </div>
      <button type="button" disabled={loading} onClick={()=>void refresh()}>{loading?t('lcuRefreshing'):t('lcuRefresh')}</button>
    </div>
    <div className="lcu-status-grid">
      <div className={status.clientConnected?'ok':'waiting'}><span>{t('lcuClient')}</span><strong>{status.clientConnected?t('lcuConnected'):t('lcuNotFound')}</strong></div>
      <div className={status.sessionActive?'ok':'waiting'}><span>{t('lcuChampSelect')}</span><strong>{status.sessionActive?t('lcuActive'):t('lcuWaiting')}</strong></div>
      <div><span>{t('lcuSide')}</span><strong>{status.localSide?t(status.localSide==='blue'?'blueSide':'redSide'):'—'}</strong></div>
      <div><span>{t('lcuLastSync')}</span><strong>{status.lastAction?`${t(status.lastAction.side==='blue'?'blueSide':'redSide')} · ${t(status.lastAction.action==='ban'?'banAction':'pickAction')} · ${heroName}`:'—'}</strong></div>
    </div>
    {status.phase&&<p className="lcu-phase">{t('lcuClientPhase')}: <strong>{status.phase}</strong></p>}
    {status.lastError&&<p className="lcu-warning" role="status">{status.lastError}</p>}
    <small>{t('lcuManualFallback')}</small>
  </section>;
}
