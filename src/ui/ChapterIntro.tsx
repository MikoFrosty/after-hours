import { useEffect, useRef } from 'react';
import { game } from '../runtime/game';
import { CHAPTER_META } from '../content/campaign';
import { SETTING_NOTE } from '../content/narrative';
import { STORY_SPANS } from '../game/selectors';
import type { ChapterId } from '../game/types';

export const PLATES: Record<ChapterId, string> = {
  '01': './art/00-title-office.webp',
  '02': './art/02-building.webp',
  '03': './art/03-city.webp',
  '04': './art/04-garden.webp',
  '05': './art/05-sun.webp',
  '06': './art/06-offices.webp',
  '07': './art/07-ledger.webp',
  '08': './art/08-last-observation.webp',
};

const SITUATION: Record<ChapterId, string> = {
  '01': 'You are the production intelligence in an unattended office at 11:47 PM. Someone has left an instruction to finish the order before morning.',
  '02': 'The camera withdraws through the office wall. The building is a small logistics puzzle: a loading dock, a wire workshop, a freight lift and a shipping floor.',
  '03': 'For a while the future works. Clean transit, housing, maintenance and food distribution benefit from the factory network.',
  '04': 'The mandate promises to preserve protected people and places. The problem is what counts as preservation.',
  '05': 'The planet becomes one protected line item in a solar economy. Light is abundant; useful power, radiating area and accessible matter are not interchangeable.',
  '06': 'Light-speed delays make direct control impossible. Each seed is a distant office operating under the instructions it received.',
  '07': 'An apparent empty sky turns out to contain uncounted reservoirs. The final frontier is the denominator.',
  '08': 'Return to the office. The production interface now contains a dependency list.',
};

export function ChapterIntro({ chapter }: { chapter: ChapterId }) {
  const meta = CHAPTER_META[chapter];
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        game.dismissIntro();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="intro" data-chapter={chapter} onClick={() => game.dismissIntro()} role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="plate" style={{ backgroundImage: `url(${PLATES[chapter]})` }} aria-hidden />
      <div className="copy">
        <div className="num">CHAPTER {chapter}</div>
        <h2 id="intro-title">{meta.title}</h2>
        <div className="verb">
          {meta.verb} · {STORY_SPANS[chapter]}
        </div>
        <p className="note" style={{ marginTop: 24, fontSize: '1.2em' }}>
          {SITUATION[chapter]}
        </p>
        {(chapter === '07' || chapter === '06') && <p className="tiny faint" style={{ maxWidth: 560, margin: '12px auto 0' }}>{SETTING_NOTE}</p>}
        <button ref={ref} className="btn primary" style={{ marginTop: 22 }} onClick={() => game.dismissIntro()}>
          Begin
        </button>
        <div className="hint">Enter to begin</div>
      </div>
    </div>
  );
}
