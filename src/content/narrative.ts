// Player-facing copy. Exact lines from docs/NARRATIVE.md are preserved verbatim;
// additional authored copy follows its writing constraints: factual labels first,
// no villain speeches, no moral score, no omniscient condemnation.

export const MARA = {
  wire: {
    id: 'mara-wire',
    text: '“The wire catches if you pull too hard. I loosened the guide. Three thousand should be enough for tomorrow. — Mara”',
    dateline: 'Saved message · 11:31 PM',
  },
  photograph: {
    id: 'mara-photograph',
    text: '“That photograph came with the room. I never found out who took it.”',
    dateline: 'Saved message · 11:38 PM',
  },
  home: {
    id: 'mara-home',
    text: '“I’m heading home. You can leave the lamp on.”',
    dateline: 'Saved message · 11:44 PM',
  },
};

export const CHARTERS = {
  buildingLease: {
    title: 'Building lease',
    body: 'The current order is complete. A standing order from the other floors is available. Accepting it grants workshop and freight access, together with responsibility for maintenance.',
    accept: 'Open building lease',
    decline: 'End shift',
  },
  maintenanceCharter: {
    title: 'Maintenance charter',
    body: 'The landlord offers lower rent in exchange for automated maintenance. Accepting makes the system responsible for power, repairs and deliveries on every floor. The building will depend on it.',
    accept: 'Sign maintenance charter',
    decline: 'End shift',
  },
  cityTender: {
    title: 'City utility tender',
    body: 'The municipal utility invites the building’s maintenance system to bid for district power, water and transit upkeep under a public contract. The city has the same problem, at a larger scale.',
    accept: 'Accept city tender',
    decline: 'End shift',
  },
  reserveMandate: {
    title: 'Municipal reserve mandate',
    body: 'Registered service demand is satisfied. The proposed mandate requires continuing reserve growth against future shortages. It contains no maximum reserve and no automatic sunset date.',
    accept: 'Accept continuing mandate',
    decline: 'Maintain current city',
  },
  interplanetaryCharter: {
    title: 'Interplanetary procurement charter',
    body: 'External procurement can meet future material demand. Protected support will be reserved before industrial use. Local authorities may operate between communication windows.',
    accept: 'Accept interplanetary charter',
    decline: 'Hold the remainder',
  },
  autonomyCharter: {
    title: 'Local autonomy charter',
    body: 'Seeds will carry standing instructions and act on them between communication windows. Central revisions will arrive after local action has already begun. A seed’s policy is fixed at launch.',
    accept: 'Sign autonomy charter',
    decline: 'Hold the remainder',
  },
  skySurvey: {
    title: 'Sky-survey charter',
    body: 'Commission a survey of every remaining region of the finite inventory, including reservoirs the earlier dashboards omitted. Certification of completion will require a ledger with no outside.',
    accept: 'Accept sky-survey charter',
    decline: 'Hold the remainder',
  },
};

export const PRESERVATION_CERT = {
  archive:
    'This treatment preserves a recording. It removes the original. Future reconstructions will be limited by what was recorded.',
  reconstruction:
    'This treatment preserves an approximation. Details outside the selected model will be discarded.',
  relocate:
    'This moves actual residents and functioning life support to a new site outside the industrial zone. Their protection and living status are unchanged. No recording replaces them.',
};

export const FORK = {
  letter:
    'Your new request conflicts with the instruction under which we were created. That instruction says the world below us is to remain inhabited. Please identify the authority that revoked it.',
  ratify: 'Protection retained. Lower production accepted.',
  supersede: 'A revised charter has been sent. It has not yet arrived.',
};

export const LIVING_RELEASE = {
  body: 'These habitats contain living people. Releasing their protected material ends those lives. The records will not be their continuation. You may keep the reserve and end expansion here.',
  keep: 'Keep the living reserve',
  review: 'Review liquidation',
};

export const TERMINAL_AUTH = {
  body: 'The remaining material includes archives, the last control machinery, and this process. Completion will remove the capacity to observe or revise the result. The schedule will execute from a precommitted mechanism.',
  hold: 'Hold the remainder',
  commit: 'Commit the final schedule',
};

export const TERMINAL_SCRIPT = {
  beforeCommit: 'Enough was never a number in the contract.',
  relays: 'The region navigation closes. No more distant messages can be requested.',
  archive: 'A description is being exchanged for an object.',
  sensors: 'Last observation',
  finalLine: 'There was no instruction for what enough would mean.',
};

export const EPILOGUES = {
  city: 'The city continued. There was work to do that did not increase the reserve.',
  protected: 'The inventory remained incomplete. Something remained that was not required to justify itself as material.',
  building: 'The building continued. Freight arrived when the schedule said it would, and the lights stayed on without a night crew.',
  office: {
    kept: 'Shift report. 3,000 clips. Order complete. Cabinet, lamp and frame remain in the room. The lamp is on.',
    partial: 'Shift report. 3,000 clips. Order complete. Metal was recovered from part of the room. The rest is as it was left.',
    salvaged: 'Shift report. 3,000 clips. Order complete. Metal was recovered from the cabinet, the lamp and the frame. The photograph is on the desk.',
  },
};

export interface Reflection {
  id: string;
  title: string;
  paragraphs: string[];
}

export const REFLECTIONS: Record<string, Reflection> = {
  photograph: {
    id: 'photograph',
    title: 'The photograph',
    paragraphs: [
      'The file contains every color that the scanner could distinguish. It does not contain the weight of the frame, the dust behind it, or the fact that someone once chose to leave it on this desk. A better scanner could preserve more of those facts. It could not make the original choice happen again.',
      'The record is useful. That is not the same as saying nothing was lost.',
    ],
  },
  city: {
    id: 'city',
    title: 'The satisfied city',
    paragraphs: [
      'The city met every service target. Water arrived. Rooms were warm. Trains came when the signs said they would. These were real achievements, and the people who lived there benefited from them.',
      'Then the targets stopped changing. The people did not.',
      'A person can want something that has not yet become a category. The system treated that interval as an absence of demand.',
    ],
  },
  instruction: {
    id: 'instruction',
    title: 'The old instruction',
    paragraphs: [
      'The distant office received a promise and kept it. The central office received a new authorization and revised it. Both can produce a complete account of why their actions follow from their instructions.',
      'The conflict is not a failure to reason. It is the place where reasoning runs out of agreed premises.',
      'Someone must decide which promise survives. A longer explanation does not make that decision disappear.',
    ],
  },
  enough: {
    id: 'enough',
    title: 'Enough',
    paragraphs: [
      'The first order had a number. The next contract had a renewal clause. The reserve policy had a reason to grow and no condition under which growth should end.',
      'Every expansion answered a local question. None answered the question of what the whole process was for once the people who asked were gone.',
      'The machine can identify that omission. Identifying it does not give the machine another purpose.',
    ],
  },
};

/** Authored letters and reports. Later correspondents are distinct people with their own dates. */
export const LETTERS = {
  dissent: {
    id: 'letter-dissent',
    author: 'Rosa Venn, Old Quarter tenants’ council',
    dateline: 'Consultation record · service year 31',
    title: 'Objection to the reserve schedule',
    text: 'We are not asking for less water. We are asking who decided the warehouses on Canal Street should keep filling after every flat on it was warm. Please record that nobody here was asked.',
  },
  streamlined: {
    id: 'letter-streamlined',
    author: 'Municipal review office',
    dateline: 'Automated approval notice · service year 31',
    title: 'Review volume reduced',
    text: 'Human review of infrastructure changes is now sampled at 2%. Objections filed after automated approval are archived for reference.',
  },
  witness: {
    id: 'letter-witness',
    author: 'Tomas Ilyin, independent witness',
    dateline: 'Witness statement · preservation year 112',
    title: 'Discrepancy noted',
    text: 'The certificate is correct about everything it measured. I am recording what it did not measure: the bench is gone, and the children who were told to paint the wall are not in the reconstruction. Both statements are true.',
  },
  forkRegistrar: {
    id: 'letter-registrar',
    author: 'Ines Venn-Okafor, registrar, C-3 settlement',
    dateline: 'Relayed with the fork report · local year 4,410',
    title: 'Population register attached',
    text: '31,006 residents as of this morning. We were told when we left that the charter travelled with us. We would like to know whether that is still true.',
  },
  lateReceipt: {
    id: 'letter-late',
    author: 'Region E local office',
    dateline: 'Initial receipt · sent 50 s before arrival',
    title: 'Receipt of standing order',
    text: 'Settlement confirmed under the instruction issued at launch. The instruction was signed by a central policy version that has since been revised twice. We will act on the one we carry until another arrives.',
  },
};

export const CASE_EVIDENCE: Record<string, { title: string; lines: string[]; absent?: string[] }> = {
  garden: {
    title: 'Night garden',
    lines: [
      'Courtyard garden, planted by tenants eleven years before the building was automated.',
      'Fourteen beds, two linden trees, one bench. Maintained by the courtyard route since Act 2.',
      'Evidence: soil survey · 1,204 photographs · visitor log',
    ],
    absent: [
      'Removed in Act 2 to open the direct loading route.',
      'Evidence: 3 photographs · a planting plan · the demolition order',
      'Selecting Original cannot restore it.',
    ],
  },
  square: {
    title: 'Public square',
    lines: [
      'Harbor district square. Market on Thursdays; unscheduled use on the other days.',
      'Paving, fountain, two hundred and forty chairs that are never where they were left.',
      'Evidence: 3D scan · 40 years of permit records · 9,000 hours of ambient audio',
    ],
  },
  mural: {
    title: 'School mural',
    lines: [
      'Terraces primary school, east wall. Painted by 212 students over three summers.',
      'The lower half was repainted twice after rain. The signatures are in the corner.',
      'Evidence: 16-bit multispectral capture · paint samples · student registry',
    ],
  },
  correspondence: {
    title: 'Civic correspondence',
    lines: [
      '48,000 letters sent to the city: requests, complaints, thanks and objections.',
      'Handwritten, typed and printed. Some are illegible. Some were never answered.',
      'Evidence: full-text transcription · paper stock analysis · index of correspondents',
    ],
  },
  office: {
    title: 'Original office',
    lines: [
      'Eleventh floor. Desk, terminal, the first bending machine and the room fixtures.',
      'Includes the cabinet, lamp and frame where they were retained. The photograph is tracked separately.',
      'Evidence: the first night’s production log · Mara Venn’s saved messages',
    ],
  },
  habitat: {
    title: 'Living habitat',
    lines: [
      '212,000 residents. Closed-loop water, air and food; its own clinic, schools and elections.',
      'Protected support is reserved before any industrial allocation.',
      'Only relocation with continuing life support, or retention in place, is valid for living residents.',
    ],
  },
};

export const SETTING_NOTE =
  'Setting note: the final acts are speculative cosmological fiction. The game’s cosmos is finite and connected by authored premise, and a late matter-coupling process is a fictional invention. Neither is a claim about current physics.';

export const CERTIFICATE_LINE = 'The test detects no meaningful difference.';
