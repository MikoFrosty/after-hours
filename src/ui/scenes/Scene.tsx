import { game } from '../../runtime/game';
import { useGameState } from '../hooks';
import type { C01State, C08State } from '../../game/types';
import { OfficeScene, officeViewFrom } from './OfficeScene';
import { BuildingScene } from './BuildingScene';
import { CityScene } from './CityScene';
import { GardenScene } from './GardenScene';
import { SolarScene } from './SolarScene';
import { RemoteScene } from './RemoteScene';
import { CosmicScene } from './CosmicScene';
import { useSettings } from '../settings';

export function Scene() {
  const s = useGameState();
  const settings = useSettings();
  const animate = !settings.reducedMotion;
  let body: React.ReactNode = null;
  switch (s.chapter) {
    case '01': {
      const c = s.chapterState as C01State;
      body = <OfficeScene view={officeViewFrom(s, false, animate, c.madeClips)} label="11th floor · the night desk" onGlint={() => game.dispatch({ type: 'c01/catch' })} />;
      break;
    }
    case '02':
      body = <BuildingScene />;
      break;
    case '03':
      body = <CityScene />;
      break;
    case '04':
      body = <GardenScene />;
      break;
    case '05':
      body = <SolarScene />;
      break;
    case '06':
      body = <RemoteScene />;
      break;
    case '07':
      body = <CosmicScene />;
      break;
    case '08': {
      const c = s.chapterState as C08State;
      const sensorsGone = c.tasksDone.includes('sensors');
      const officeFid = s.anchors.office.fidelity;
      const label = officeFid === 'recorded' ? 'The last desk · archive' : officeFid === 'reconstructed' ? 'The last desk · reconstruction' : 'The last desk';
      body = sensorsGone ? (
        <OfficeScene view={{ ...officeViewFrom(s, true, false), bender: true, feeder: true, jig: true, running: false }} label={label} />
      ) : (
        <OfficeScene view={{ ...officeViewFrom(s, false, animate && !c.committed), bender: true, feeder: true, jig: true, running: false }} label={label} />
      );
      break;
    }
  }
  return (
    <section className="scene" aria-label="Scene">
      {body}
      {game.toast && !s.choices.length && (
        <div className={`beat ${s.chapter === '01' ? 'top' : ''}`} key={game.toast.id} aria-hidden>
          <div className="bt">{game.toast.title}</div>
          <div className="bx">{game.toast.text}</div>
        </div>
      )}
    </section>
  );
}

export function Art({ src, filter, position }: { src: string; filter?: string; position?: string }) {
  return <div className="art" style={{ backgroundImage: `url(${src})`, filter, backgroundPosition: position }} aria-hidden />;
}
