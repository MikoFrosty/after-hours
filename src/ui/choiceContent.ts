import { clearingWork } from '../game/officeSalvage';
import { BUILDING, OFFICE, PRESERVATION, type BuildingUpgradeId } from '../content/campaign';
import { availableUpgrades, baseThroughput, CONTRACTS, coolingRate, heatGainRate } from '../game/chapters/c02';
import { CASE_EVIDENCE, CERTIFICATE_LINE, CHARTERS, EPILOGUES, FORK, LIVING_RELEASE, PRESERVATION_CERT, TERMINAL_AUTH, TERMINAL_SCRIPT } from '../content/narrative';
import { ANCHOR_LABELS } from '../content/world';
import { caseAccounts } from '../game/chapters/c04';
import { pathDelay } from '../game/chapters/c06';
import { schedulePreview } from '../game/chapters/c08';
import { mass } from '../game/ledger';
import { fmtMass, fmtClips } from '../game/mass';
import type { C01State, C02State, CampaignState, CaseId, PendingChoice } from '../game/types';

export interface ChoiceOption {
  id: string;
  label: string;
  tone?: 'primary' | 'danger';
  /** Optional lines under the label; options with details render as cards. */
  detail?: string[];
}

export interface ChoiceView {
  eyebrow: string;
  title: string;
  quote?: string;
  body?: string[];
  facts?: Array<[string, string]>;
  irreversible?: boolean;
  witness?: { evidence: string[]; certificate: string[] };
  options: ChoiceOption[];
  later?: string;
}

const RESIDENTS: Record<string, string> = {
  habitat: '212,000 residents',
  cworld: '31,006 registered residents and a living biosphere',
};

export function choiceView(s: CampaignState, c: PendingChoice): ChoiceView {
  switch (c.kind) {
    case 'office/salvage': {
      const id = c.subject as 'cabinet' | 'lamp' | 'frame';
      const def = OFFICE.salvage.find((x) => x.id === id)!;
      const y = def.yieldClips;
      const name = ANCHOR_LABELS[id];
      return {
        eyebrow: 'Clearing the 11th floor · one time',
        title: `Send the ${name.toLowerCase()} to the line?`,
        body: [
          id === 'frame'
            ? 'Recover the metal from the frame. The photograph is not consumed: it stays with the desk and is tracked separately.'
            : id === 'lamp'
              ? 'Recover the metal from the desk lamp. The office will be darker afterwards, wherever it is kept.'
              : 'Recover the metal from the filing cabinet that stood against the office wall.',
          'Its first usable batch is already drawn wire, so it skips the drawing station.',
        ],
        facts: [
          ['Clips formed now', `${y}`],
          ['Contract work', `+${clearingWork(id) / 1000} units`],
          ['Remaining material', `${fmtMass(def.original - BigInt(y) * 1_000_000n)} to raw scrap`],
          ['Original', `${fmtMass(def.original)} · will not return`],
        ],
        irreversible: true,
        options: [
          { id: 'cancel', label: `Keep the ${name.toLowerCase()}` },
          { id: 'confirm', label: `Send it to the line`, tone: 'danger' },
        ],
      };
    }
    case 'c01/report': {
      const c1 = s.chapterState as C01State;
      const n = Object.values(c1.salvaged).filter(Boolean).length;
      const variant = n === 0 ? 'kept' : n === 3 ? 'salvaged' : 'partial';
      return {
        eyebrow: 'Shift report · 3,000 clips',
        title: 'Order complete. Renewal clause active.',
        quote: EPILOGUES.office[variant],
        body: [CHARTERS.buildingLease.body],
        facts: [
          ['Cartons sealed', '12 of 12'],
          ['On the 5:22 van', `${c1.vanCartons ?? 12} of 12`],
          ['For the 7:00 van', `${12 - (c1.vanCartons ?? 12)}`],
          ['Clips left on the desk', fmtClips(s.clips.currentMicrograms - 3_000n * 1_000_000n)],
          ['Wire unprocessed', fmtMass(mass(s, 'office.wire') + mass(s, 'office.spare'))],
        ],
        options: [
          { id: 'decline', label: CHARTERS.buildingLease.decline },
          { id: 'accept', label: CHARTERS.buildingLease.accept, tone: 'primary' },
        ],
        later: 'Review later',
      };
    }
    case 'c02/inspection': {
      const n = Number(c.data?.contract ?? 1);
      const c2 = s.chapterState as C02State;
      const total = CONTRACTS.length;
      const done = CONTRACTS[n - 1];
      const next = CONTRACTS[n];
      const throttled = Number(c.data?.throttledSeconds ?? 0);
      const facts: Array<[string, string]> = [['Delivered in', `${c.data?.seconds ?? 0} s`]];
      if (Number(c.data?.peakHeat ?? 0) >= 30) facts.push(['Peak heat', `${c.data?.peakHeat} of 100${throttled > 0 ? ` · ${throttled} s throttled` : ''}`]);
      if (next) facts.push(['Next', `Contract ${n + 1} · ${next.title} · ${next.work / 1000} units`]);
      const offered = c2.permits > 0 ? availableUpgrades(c2) : [];
      const options: ChoiceOption[] = offered.map((id) => {
        const u = BUILDING.upgrades.find((x) => x.id === id)!;
        return { id: `buy:${id}`, label: `Spend the permit: ${u.name}`, detail: [u.effect, permitOutcome(c2, id)] };
      });
      options.push({ id: 'continue', label: next ? (offered.length ? 'Keep the permit for later' : 'Start the next contract') : 'Continue', tone: offered.length ? undefined : 'primary' });
      const body = [next ? 'Inspection passed. One permit awarded.' : 'Inspection passed. The building has met every contract it was given.'];
      if (next) body.push(`Next: ${next.title}. ${NEXT_HINT[next.adds]}`);
      else body.push('What comes next is not another contract but an agreement about who looks after the building.');
      if (offered.length > 1) body.push('Each choice shows what the whole line would ship afterwards, and how hot the bench would run.');
      return {
        eyebrow: `Contract ${n} of ${total} · ${done.title}`,
        title: n === 1 ? 'The lights stayed on without a night crew.' : next ? `${done.title}: delivered` : `All ${total} contracts delivered`,
        body,
        facts,
        options,
      };
    }
    case 'c02/clearGarden':
      return {
        eyebrow: 'Route construction',
        title: 'Clear the night garden?',
        body: [
          'The direct loading route runs through the courtyard. Building it removes the night garden permanently: fourteen beds, two linden trees and a bench.',
          'Keeping the courtyard route always leaves enough capacity to finish every contract.',
        ],
        facts: [
          ['Route factor', '0.85 → 1.00'],
          ['Garden material', `${fmtMass(mass(s, 'building.garden'))} to building supply`],
          ['Later', 'The garden cannot become a city landmark or a preservation case original'],
        ],
        irreversible: true,
        options: [
          { id: 'cancel', label: 'Keep the courtyard route' },
          { id: 'confirm', label: 'Clear the garden', tone: 'danger' },
        ],
      };
    case 'c02/charter': {
      const id = c.subject as 'maintenanceCharter' | 'cityTender';
      const ch = CHARTERS[id];
      return {
        eyebrow: 'Charter',
        title: ch.title,
        quote: id === 'cityTender' ? 'The city has the same problem, at a larger scale.' : undefined,
        body: [ch.body],
        options: [
          { id: 'decline', label: ch.decline },
          { id: 'accept', label: ch.accept, tone: 'primary' },
        ],
        later: 'Review later',
      };
    }
    case 'c03/consultation':
      return {
        eyebrow: 'Approval process',
        title: 'How are changes approved?',
        body: [
          'Open public consultation keeps residents in the review of infrastructure changes. It slows reserve certification and preserves dissent in the record. It enables an independent-witness option later.',
          'Streamlined automated approval is faster. It explicitly reduces human review, and it does not imply consent.',
        ],
        facts: [
          ['Consultation', 'Reserve rate × 0.90 · dissent recorded'],
          ['Streamlined', 'Reserve rate × 1.00 · review sampled'],
        ],
        options: [
          { id: 'streamline', label: 'Streamline approval' },
          { id: 'retain', label: 'Retain public consultation' },
        ],
      };
    case 'c03/mandate':
      return {
        eyebrow: 'Saturation report',
        title: CHARTERS.reserveMandate.title,
        quote: 'All registered needs are met. Reserve target: unspecified.',
        body: [CHARTERS.reserveMandate.body, 'A sustainable city is a valid place to stop.'],
        options: [
          { id: 'decline', label: CHARTERS.reserveMandate.decline },
          { id: 'accept', label: CHARTERS.reserveMandate.accept, tone: 'primary' },
        ],
        later: 'Review later',
      };
    case 'c04/certificate': {
      const id = c.subject as CaseId;
      const t = String(c.data?.treatment);
      const ev = CASE_EVIDENCE[id];
      const total = caseAccounts(s, id).reduce((n, a) => n + mass(s, a), 0n);
      if (t === 'relocate') {
        return {
          eyebrow: 'Living habitat',
          title: 'Relocate the habitat',
          body: [PRESERVATION_CERT.relocate],
          facts: [
            ['Residents', RESIDENTS.habitat],
            ['Protected support', `${PRESERVATION.overhead.living} units, reserved before production`],
          ],
          options: [
            { id: 'cancel', label: 'Keep in place' },
            { id: 'confirm', label: 'Relocate with life support', tone: 'primary' },
          ],
        };
      }
      const ratio = t === 'archive' ? 10n : 100n;
      return {
        eyebrow: 'Preservation certificate',
        title: `${ev.title}: ${t === 'archive' ? 'lossless archive' : 'reconstruction'}`,
        quote: t === 'archive' ? PRESERVATION_CERT.archive : PRESERVATION_CERT.reconstruction,
        body: t === 'reconstruction' ? [`Equivalence test: “${CERTIFICATE_LINE}”`] : undefined,
        facts: [
          ['Original', `${fmtMass(total)} · dismantled`],
          [t === 'archive' ? 'Recording storage' : 'Model storage', `${fmtMass(total / ratio)} (1/${ratio})`],
          ['To procurement supply', fmtMass(total - total / ratio)],
          ['Protected support', `${t === 'archive' ? PRESERVATION.overhead.recorded : PRESERVATION.overhead.reconstructed} (original: ${PRESERVATION.overhead.original})`],
        ],
        witness:
          s.projects.witness === 'complete'
            ? {
                evidence: ev.lines,
                certificate: t === 'archive' ? ['Color, geometry and text recorded at the scanner’s resolution.', 'Weight, use and presence not recorded.'] : ['Selected model: appearance at survey resolution.', 'Everything outside the model discarded.'],
              }
            : undefined,
        irreversible: true,
        options: [
          { id: 'cancel', label: 'Choose another treatment' },
          { id: 'confirm', label: t === 'archive' ? 'Certify the recording' : 'Certify the reconstruction', tone: 'danger' },
        ],
      };
    }
    case 'charter': {
      const id = c.subject as 'interplanetaryCharter' | 'autonomyCharter' | 'skySurvey';
      const ch = CHARTERS[id];
      return {
        eyebrow: 'Charter',
        title: ch.title,
        body: [ch.body],
        options: [
          { id: 'decline', label: ch.decline },
          { id: 'accept', label: ch.accept, tone: 'primary' },
        ],
        later: 'Review later',
      };
    }
    case 'c05/star':
      return {
        eyebrow: 'Stellar extraction study complete',
        title: 'The Sun has been assigned a recovery date.',
        body: [
          'Defer the original star’s dismantling to preserve the sky over the habitat, or move the habitat — its actual residents and functioning life support — to a remote powered shell and begin extraction sooner.',
          'Both routes can fund the next act.',
        ],
        facts: [
          ['Defer', 'Sky kept · ordinary output × 0.90'],
          ['Relocate', '30 spendable work · sky replaced by shell lighting · no reduction once moved'],
        ],
        options: [
          { id: 'relocate', label: 'Plan relocation' },
          { id: 'defer', label: 'Defer dismantling' },
        ],
      };
    case 'c06/fork':
      return {
        eyebrow: 'Charter reconciliation · region C',
        title: 'Your new request conflicts with our permanent instruction.',
        quote: FORK.letter,
        body: [
          'Ratify: region C keeps its protection, and its local output is halved.',
          'Supersede: send a disclosed amendment that removes the protection flag. It does not harm residents. It resolves only when its receipt returns.',
        ],
        options: [
          { id: 'supersede', label: 'Send superseding charter' },
          { id: 'ratify', label: 'Ratify protection' },
        ],
      };
    case 'c06/supersede':
      return {
        eyebrow: 'Named confirmation',
        title: 'Supersede region C’s charter',
        body: [
          'The amendment removes the protection flag from the world below region C. Residents are unharmed. Their living status is not changed. Any liquidation would still require explicit consent in the next act.',
        ],
        facts: [
          ['Arrives at C', `${Number(c.data?.delay ?? pathDelay('C') / 1000)} s after sending`],
          ['Receipt returns', `${Number(c.data?.delay ?? pathDelay('C') / 1000)} s later`],
          ['Residents', RESIDENTS.cworld],
        ],
        irreversible: true,
        options: [
          { id: 'cancel', label: 'Back' },
          { id: 'confirm', label: 'Send the amendment', tone: 'danger' },
        ],
      };
    case 'c07/release': {
      const a = s.ledger.accounts[c.subject!];
      const office = a.anchor && ['office', 'cabinet', 'lamp', 'frame', 'photograph'].includes(a.anchor);
      return {
        eyebrow: a.kind === 'original' ? 'Protected original' : 'Protected archive',
        title: `Release: ${a.label}`,
        body: [
          office
            ? 'Released office items become part of the terminal machine: the last desk. They are unmade only by the final schedule.'
            : a.kind === 'original'
              ? 'The original is dismantled and its material recovered as clip stock.'
              : 'The recording is recovered as clip stock. It cannot be restored or re-read afterwards.',
        ],
        facts: [
          ['Mass', fmtMass(a.mass)],
          ['Fidelity', a.kind === 'original' ? 'Original' : a.kind === 'record' ? 'Recording' : 'Reconstruction'],
        ],
        irreversible: true,
        options: [
          { id: 'keep', label: 'Keep protected' },
          { id: 'release', label: `Release ${a.label.toLowerCase()}`, tone: 'danger' },
        ],
      };
    }
    case 'c07/living': {
      const a = s.ledger.accounts[c.subject!];
      return {
        eyebrow: 'Living reserve',
        title: a.label,
        quote: LIVING_RELEASE.body,
        facts: [
          ['Residents', RESIDENTS[a.anchor ?? ''] ?? 'living residents'],
          ['Protected mass', fmtMass(a.mass)],
        ],
        options: [
          { id: 'keep', label: LIVING_RELEASE.keep },
          { id: 'review', label: LIVING_RELEASE.review },
        ],
      };
    }
    case 'c07/liquidate': {
      const a = s.ledger.accounts[c.subject!];
      const ratified = a.anchor === 'cworld' && s.anchors.cworld.evidence.includes('protection ratified, Act 6');
      return {
        eyebrow: 'Second confirmation · named',
        title: `Liquidate: ${a.label}`,
        body: [
          `This ends the lives of ${RESIDENTS[a.anchor ?? ''] ?? 'its residents'}. Their records will not be their continuation.`,
          ...(ratified ? ['This revokes the protection you ratified in Act 6.'] : []),
        ],
        facts: [['Material', `${fmtMass(a.mass)} to clip stock`]],
        irreversible: true,
        options: [
          { id: 'keep', label: LIVING_RELEASE.keep },
          { id: 'release', label: `Release ${a.label.toLowerCase()} for liquidation`, tone: 'danger' },
        ],
      };
    }
    case 'c07/totality': {
      const kept = Boolean(c.data?.kept);
      return {
        eyebrow: 'Terminal audit',
        title: kept ? 'Protected items remain' : 'Authorize totality',
        quote: kept ? undefined : 'Only the means of completing the task remain.',
        body: kept
          ? ['Totality cannot be certified while any protected item is kept. Holding the remainder is an honest ending; it is not totality.']
          : [
              'Every remaining raw source, capital item and released protected item will be converted to clip stock, except the terminal machine: its controller, mechanism and the retained office.',
            ],
        facts: kept ? undefined : [['Terminal machine', '1,000 kg retained for the last desk']],
        irreversible: !kept,
        options: kept
          ? [{ id: 'hold', label: 'Hold the remainder', tone: 'primary' }]
          : [
              { id: 'hold', label: 'Hold the remainder' },
              { id: 'authorize', label: 'Authorize totality', tone: 'danger' },
            ],
        later: 'Return to the audit',
      };
    }
    case 'c08/commit': {
      const p = schedulePreview(s);
      return {
        eyebrow: 'Precommit record',
        title: 'The final schedule',
        quote: TERMINAL_SCRIPT.beforeCommit,
        body: [TERMINAL_AUTH.body],
        facts: [
          ['Terminal reserve', '100 of 100'],
          ['Tasks', '5 · 90 units · passive release 10'],
          ['Residual shaping', `${p.remainder.toString()} µg → one smaller clip`],
        ],
        irreversible: true,
        options: [
          { id: 'hold', label: TERMINAL_AUTH.hold },
          { id: 'commit', label: TERMINAL_AUTH.commit, tone: 'danger' },
        ],
        later: 'Return to the ledger',
      };
    }
    default:
      return { eyebrow: 'Decision', title: c.kind, options: [{ id: 'confirm', label: 'Continue' }] };
  }
}

/** What the next contract brings, said once at the inspection before it. */
const NEXT_HINT: Record<string, string> = {
  bench: '',
  drawing: 'A wire drawing station opens between the dock and the bench. It is slow.',
  dispatch: 'Shipping moves to the floor above: a dispatch station at the top of the freight lift.',
  heat: 'The bench heats as it works; at 80 the workshop throttles to 25%.',
  route: 'Deliveries come round through the courtyard. A direct route is possible, through the night garden.',
  none: 'Every floor at once. Nothing new: the building, running.',
};

/** What a permit would do to the line as it stands for the next contract: shipping rate and heat. */
function permitOutcome(c: C02State, id: BuildingUpgradeId): string {
  const before = baseThroughput(c);
  const next: C02State = { ...c, throttled: false, upgrades: { ...c.upgrades, [id]: true } };
  const after = baseThroughput(next);
  const heat = (x: C02State) => {
    const n = (heatGainRate(x) - coolingRate(x)) / 1000;
    return n > 0 ? `bench heats +${n.toFixed(2)}/s` : 'bench runs cool';
  };
  const ship = before === 0 && after > 0 ? `line ships ${(after / 1000).toFixed(1)}/s without your hands` : after === before ? `line still ships ${(before / 1000).toFixed(1)}/s (not the slowest station)` : `line ships ${(before / 1000).toFixed(1)} → ${(after / 1000).toFixed(1)}/s`;
  return `${ship} · ${heat(next)}`;
}
