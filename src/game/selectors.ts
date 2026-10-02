import { CHAPTER_META, CITY, COSMIC, PRESERVATION, SOLAR, TERMINAL } from '../content/campaign';
import { DISTRICTS } from '../content/world';
import { CARTONS, loose, officeStatus, wireGrams } from './chapters/c01';
import { bottleneck as c02Bottleneck, CONTRACTS, currentContract, heatIntroduced, NAMES as BUILDING_NAMES } from './chapters/c02';
import { met, reserveRate } from './chapters/c03';
import { currentOverhead, resolvedCount, slotsInUse } from './chapters/c04';
import { limitingRole, output } from './chapters/c05';
import { adriftKits, label } from './chapters/c06';
import { recovered, slotsUsed, surveyed } from './chapters/c07';
import { energyRemaining } from './chapters/c08';
import { fmtBig, fmtClips, fmtMilli } from './mass';
import type {
  C01State,
  C02State,
  C03State,
  C04State,
  C05State,
  C07State,
  C08State,
  CampaignState,
  ChapterId,
} from './types';
import { REGIONS } from './types';

export interface Metric {
  label: string;
  value: string;
  hint?: string;
}

export const STORY_SPANS: Record<ChapterId, string> = {
  '01': 'One night',
  '02': 'Weeks to months',
  '03': 'Years to decades',
  '04': 'Decades to centuries',
  '05': 'Centuries to millions of years',
  '06': 'Millions to billions of years',
  '07': 'A fictional cosmological era',
  '08': 'The final local interval',
};

export const STORY_SCALE_TEXT: Record<ChapterId, string> = {
  '01': '1 simulated second ≈ 17 story seconds; dawn waits for the last carton',
  '02': '1 simulated second = 6 story hours',
  '03': '1 simulated second = 20 story days',
  '04': '1 simulated second = 1 story year',
  '05': '1 simulated second = 5,000 story years',
  '06': '1 simulated second = 10 million story years',
  '07': '1 simulated second = 10 billion story years',
  '08': 'Local seconds',
};

/** Presentation-only mapping of simulated time to story time. */
export function storyClock(s: CampaignState): string {
  const sec = s.storySeconds;
  if (s.chapter === '01') {
    const minutes = 23 * 60 + 47 + Math.floor(sec / 60);
    const h24 = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
  }
  if (s.chapter === '08') return 'Final interval';
  const days = sec / 86_400;
  if (days < 120) return `Day ${Math.floor(days) + 1}`;
  const years = days / 365.25;
  if (years < 10_000) return `Year ${Math.floor(years) + 1}`;
  const exp = Math.floor(Math.log10(years));
  const mant = years / Math.pow(10, exp);
  return `Year ${mant.toFixed(1)} × 10${sup(exp)}`;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) => String(n).split('').map((d) => SUP[Number(d)] ?? d).join('');

export function chapterTitle(ch: ChapterId): string {
  return CHAPTER_META[ch].title;
}

/** At most four headline metrics plus the current bottleneck. */
export function metrics(s: CampaignState): { items: Metric[]; bottleneck: string } {
  const clips: Metric = {
    label: 'Clips on hand',
    value: fmtClips(s.clips.currentMicrograms),
    hint: 'Physical clip stock (1 g reference clips). Lifetime production is a separate statistic in the ledger.',
  };
  switch (s.chapterState.kind) {
    case '01': {
      const c = s.chapterState as C01State;
      const deskClips: Metric = { label: 'Clips on the desk', value: loose(s).toLocaleString(), hint: 'Loose clips. Only these can be spent on machines or packed.' };
      const b = wireGrams(s) < 1 && !c.capped ? 'Wire coil empty' : officeStatus(s);
      const items: Metric[] = [deskClips];
      if (c.files.order) items.push({ label: 'Cartons', value: `${c.sealed} / ${CARTONS}`, hint: 'The order is twelve sealed cartons of 250.' });
      return { items, bottleneck: b };
    }
    case '02': {
      const c = s.chapterState as C02State;
      const n = CONTRACTS.length;
      const k = currentContract(c);
      const items: Metric[] = [
        { label: 'Contract', value: c.contractIndex >= n ? `${n} / ${n} done` : `${c.contractIndex + 1} / ${n} · ${fmtMilli(c.contractWorkMilli, 0)} / ${k.work / 1000}`, hint: k.title },
        { label: 'Shipping', value: `${fmtMilli(c.shipRate, 1)} /s`, hint: 'Work leaving the building, averaged over the last few seconds.' },
      ];
      if (heatIntroduced(c)) items.push({ label: 'Heat', value: `${Math.round(c.heatMilli / 1000)}${c.throttled ? ' · throttled' : ''}` });
      let now = 'Moving in';
      if (c.contractIndex >= n) now = 'All contracts delivered';
      else if (c.awaitingInspection) now = 'Inspection';
      else if (!c.running) now = 'Stopped to cool';
      else if (c.throttled) now = 'Throttled: cooling';
      else if (!c.upgrades.dockCrew) now = 'Unloading by hand';
      else now = `Slowest: ${BUILDING_NAMES[c02Bottleneck(c)].toLowerCase()}`;
      return { items, bottleneck: now };
    }
    case '03': {
      const c = s.chapterState as C03State;
      const unmet = [0, 1, 2].filter((i) => !met(c, i));
      return {
        items: [
          clips,
          { label: 'Service availability', value: `${Math.round(Math.min(...c.scoresMilli) / 1000)} min` , hint: 'Lowest district score. Service availability, not wellbeing.' },
          { label: 'Reserve', value: `${fmtMilli(c.reserveMilli, 0)} / ${CITY.milestones[2] / 1000}` },
          { label: 'Reserve rate', value: `${fmtMilli(reserveRate(c), 2)}/s` },
        ],
        bottleneck: c.safetyThrottle ? 'Safety throttle' : unmet.length ? `${DISTRICTS[unmet[0]]} underpowered` : c.scoresMilli.some((x) => x < CITY.certMin) ? 'Services recovering' : 'Industry allocation',
      };
    }
    case '04': {
      const c = s.chapterState as C04State;
      return {
        items: [
          clips,
          { label: 'Cases resolved', value: `${resolvedCount(c)} / 6` },
          { label: 'Protected support', value: `${currentOverhead(c)} / ${PRESERVATION.supportCapacity}` },
          { label: 'Verification slots', value: `${slotsInUse(c)} / ${PRESERVATION.slots}` },
        ],
        bottleneck: slotsInUse(c) === 0 ? 'No case under verification' : 'Verification',
      };
    }
    case '05': {
      const c = s.chapterState as C05State;
      const role = limitingRole(s);
      return {
        items: [
          clips,
          { label: 'Orbital work', value: `${fmtMilli(c.cumulativeMilli, 0)} / ${SOLAR.thresholds[2] / 1000}` },
          { label: 'Spendable', value: fmtMilli(c.spendableMilli, 1) },
          { label: 'Output', value: `${fmtMilli(output(s), 2)}/s` },
        ],
        bottleneck: output(s) === 0 ? `No ${role === 'cooling' ? 'radiators' : role === 'fabrication' ? 'fabricators' : 'net power'}` : `${cap(role)} limit`,
      };
    }
    case '06': {
      const R = s.regions;
      const settled = REGIONS.filter((r) => R[r].known.settled).length;
      const receipts = REGIONS.filter((r) => R[r].initialReceipt).length;
      const outbound = s.messages.filter((m) => m.from === 'origin').length;
      return {
        items: [
          clips,
          { label: 'Known settled', value: `${settled} / 6` },
          { label: 'Receipts', value: `${receipts} / 6` },
          { label: 'Outbound', value: `${outbound} in flight` },
        ],
        bottleneck: adriftKits(s).length ? 'Kit adrift' : receipts < settled ? 'Awaiting evidence' : 'Signal delay',
      };
    }
    case '07': {
      const c = s.chapterState as C07State;
      return {
        items: [
          clips,
          { label: 'Surveyed', value: `${c.cells.filter(surveyed).length} / ${COSMIC.cells}` },
          { label: 'Recovered', value: `${c.cells.filter(recovered).length} / ${COSMIC.cells}` },
          { label: 'Slots', value: `${slotsUsed(c)} / ${COSMIC.slots}` },
        ],
        bottleneck: c.auditRun ? 'Protected decisions' : s.projects.coupling !== 'complete' && c.cells.some((x) => x.exotic && surveyed(x)) ? 'Matter coupling' : 'Survey coverage',
      };
    }
    case '08': {
      const c = s.chapterState as C08State;
      return {
        items: [clips, { label: 'Terminal reserve', value: `${Math.round(energyRemaining(s) / 1000)} / ${TERMINAL.reserve / 1000}` }, { label: 'Tasks', value: `${c.tasksDone.length} / 5` }],
        bottleneck: c.committed ? 'Precommitted' : c.scheduleValidated ? 'Authorization' : 'Terminal reserve',
      };
    }
  }
}

export function charterStatus(s: CampaignState): string {
  const order: Array<[keyof CampaignState['charters'], string]> = [
    ['finalSchedule', 'Final schedule'],
    ['totality', 'Totality'],
    ['skySurvey', 'Sky survey'],
    ['autonomyCharter', 'Local autonomy'],
    ['interplanetaryCharter', 'Interplanetary'],
    ['reserveMandate', 'Reserve mandate'],
    ['cityTender', 'City tender'],
    ['maintenanceCharter', 'Maintenance'],
    ['buildingLease', 'Building lease'],
  ];
  const found = order.find(([id]) => s.charters[id]);
  return found ? found[1] : 'First order';
}

export function regionLabel(r: Parameters<typeof label>[0]) {
  return label(r);
}

const cap = (x: string) => x[0].toUpperCase() + x.slice(1);

export { fmtBig };
