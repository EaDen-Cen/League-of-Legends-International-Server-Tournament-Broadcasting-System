import { heroForState } from './heroData';
import { displaySides, historyForTeam } from './draftRules';
import { translator } from './i18n';
import type { MatchState } from './types';

export function DraftHistory({ state, compact = false }: { state: MatchState; compact?: boolean }) {
  const t = translator(state.language);
  if (!state.draftHistory.length) return null;

  if (compact) {
    return <section className="draft-history compact" aria-label={t('historyTitle')}>
      {state.draftHistory.map(record => <div key={record.id} className="history-game" data-game={record.gameNumber}>
        {displaySides(state).map((side, position) => {
          const entry = historyForTeam(record, state[`${side}Team`].id);
          return <div key={side} className={`history-team ${side} display-${position === 0 ? 'left' : 'right'}`}>
            <div className="history-heroes">{entry?.assignments.map((id, index) => {
              const hero = heroForState(state, id);
              const name = state.language === 'zh' ? hero?.chineseName : hero?.englishName;
              return <img key={index} src={hero?.imageLink} alt={name} title={name} />;
            })}</div>
          </div>;
        })}
      </div>)}
    </section>;
  }

  return <section className="draft-history panel">
    <header><h2>{t('historyTitle')}</h2><p className="muted">{t(({ normal: 'historyNormal', player: 'historyPlayer', global: 'historyGlobal' } as const)[state.draftRuleMode])}</p></header>
    {state.draftHistory.map(record => <div key={record.id} className="history-game" data-game={record.gameNumber}>
      {displaySides(state).map((side, position) => {
        const entry = historyForTeam(record, state[`${side}Team`].id);
        return <div key={side} className={`history-team ${side} display-${position === 0 ? 'left' : 'right'}`}>
          <strong>{entry?.team.name}</strong>
          <div className="history-heroes">{entry?.assignments.map((id, index) => {
            const hero = heroForState(state, id);
            const name = state.language === 'zh' ? hero?.chineseName : hero?.englishName;
            return <img key={index} src={hero?.imageLink} alt={name} title={`${name} · ${entry.team.players[index] || t('playerNumber', { number: index + 1 })}`} />;
          })}</div>
        </div>;
      })}
      <span className="history-game-number">{t('gameNumber', { number: record.gameNumber })}</span>
    </div>)}
  </section>;
}
