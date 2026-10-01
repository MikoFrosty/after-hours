// Authored masses and identities for tracked places and things.
// These are fictional accounting seeds, not physical estimates. See docs/DESIGN-NOTES.md.

export const OFFICE_ACCOUNTS = {
  wire: 3_000_000_000n, // 3 kg wire coil
  spare: 3_000_000_000n, // 3 kg spare coil in the cabinet's bottom drawer
  cabinet: 10_000_000_000n, // 10 kg
  lamp: 2_000_000_000n, // 2 kg
  frame: 400_000_000n, // 400 g
  photograph: 5_000_000n, // 5 g
  equipment: 100_000_000_000n, // desk, terminal, machine and room fixtures
};

/** Building (Act 2): the night garden in the courtyard. */
export const GARDEN_MASS = 2_000_000_000_000n; // 2 t of soil, beds and trees

/** City (Act 3) tracked places, carved from the city's disclosed grant. */
export const CITY_ANCHORS = {
  square: 5_000_000_000_000_000n, // 5 kt public square
  mural: 3_000_000_000_000n, // 3 t school mural wall
  correspondence: 500_000_000_000n, // 500 kg of civic letters
  habitat: 1_000_000_000_000_000_000n, // 1 Mt closed-loop living habitat
};

/** Distant region C: an inhabited world protected by an older charter. */
export const CWORLD_MASS = 6_000_000_000_000_000_000_000_000_000_000_000n; // 6 × 10^33 µg

/** Solar construction projects reserve these inputs as capital. */
export const SOLAR_PROJECT_MASS = 1_000_000_000_000_000_000_000_000_000n; // 10^27 µg each

export const ANCHOR_LABELS: Record<string, string> = {
  cabinet: 'Filing cabinet',
  lamp: 'Desk lamp',
  frame: 'Picture frame',
  photograph: 'Photograph',
  garden: 'Night garden',
  square: 'Public square',
  mural: 'School mural',
  correspondence: 'Civic correspondence',
  office: 'Original office',
  habitat: 'Living habitat',
  sky: 'Sky over the habitat',
  cworld: 'World below region C',
};

export const DISTRICTS = ['Harbor', 'Terraces', 'Old Quarter'] as const;
