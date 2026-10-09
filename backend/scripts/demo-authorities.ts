/**
 * Demo authority profiles.
 *
 * Everything that differs between one revenue authority's demo and another's
 * lives here, so adding a third is a profile entry rather than a forked script.
 * Selected with DEMO_AUTHORITY (default: ogirs).
 *
 * `homeStates` matters beyond cosmetics: it decides who counts as a resident for
 * JRB Act 2025 §15 cross-state referral. Get it wrong and the authority is shown
 * its own residents as candidates to refer away to itself.
 */
export interface AuthorityProfile {
  /** Database the seed is allowed to write to — a guard against seeding live data. */
  database: string;
  name: string;
  shortName: string;
  emailDomain: string;
  /** base64 data-URI file under scripts/demo-assets, or null for the placeholder. */
  logoFile: string | null;

  /** §15 home jurisdiction. */
  homeAuthority: string;
  homeStates: string[];          // upper-case
  homeTerritoryLabel: string;    // how the territory is named on screen

  /** Value written to taxpayer.stateOfResidence for residents. */
  residentState: string;
  /** Second-tier localities — LGAs, or Area Councils in the FCT. */
  localities: string[];
  /** Place names used to build invented business names. */
  placeNames: string[];
  /** Given/family name pools, so the population reads like the territory's. */
  firstNames: string[];
  lastNames: string[];
  /** Staff shown in the demo. */
  staff: { local: string; role: string; firstName: string; lastName: string }[];
}

const SHARED_LAST = ['Okonkwo', 'Eze', 'Bello', 'Danjuma', 'Musa', 'Okafor', 'Nwosu', 'Abubakar'];

export const AUTHORITIES: Record<string, AuthorityProfile> = {
  ogirs: {
    database: 'findata_demo',
    name: 'OGUN STATE INTERNAL REVENUE SERVICE',
    shortName: 'OGIRS',
    emailDomain: 'ogirs.og.gov.ng',
    logoFile: 'ogirs-logo.b64',

    homeAuthority: 'Ogun State IRS',
    homeStates: ['OGUN'],
    homeTerritoryLabel: 'Ogun',

    residentState: 'Ogun',
    localities: ['Abeokuta North', 'Abeokuta South', 'Ado-Odo/Ota', 'Egbado North', 'Egbado South',
      'Ewekoro', 'Ifo', 'Ijebu East', 'Ijebu North', 'Ijebu Ode', 'Ikenne', 'Imeko Afon', 'Ipokia',
      'Obafemi Owode', 'Odeda', 'Odogbolu', 'Ogun Waterside', 'Remo North', 'Sagamu'],
    placeNames: ['Abeokuta', 'Ijebu', 'Sagamu', 'Ota', 'Ilaro', 'Ayetoro', 'Owode', 'Iperu',
      'Odogbolu', 'Ifo', 'Agbara', 'Remo', 'Egba', 'Yewa', 'Obafemi', 'Ewekoro'],
    firstNames: ['Adebayo', 'Folasade', 'Oluwaseun', 'Babatunde', 'Yetunde', 'Ifeoluwa', 'Gbenga',
      'Morayo', 'Tolulope', 'Segun', 'Aderonke', 'Kehinde', 'Taiwo', 'Bolanle', 'Femi', 'Abiodun',
      'Omolara', 'Damilola', 'Funmilayo', 'Olamide', 'Temitope', 'Ayodeji'],
    lastNames: ['Adeyemi', 'Ogunleye', 'Balogun', 'Odutola', 'Sonaike', 'Adewale', 'Onabanjo',
      'Kuforiji', 'Ademola', 'Oyelaran', 'Shodipo', 'Ogundipe', 'Dosunmu', 'Anjorin', 'Oluwole',
      'Bankole', 'Ilori', 'Fadipe', 'Salako', 'Odunsi'],
    staff: [
      { local: 'admin', role: 'SUPER_ADMIN', firstName: 'Adeola', lastName: 'Ogunsanya' },
      { local: 'analyst', role: 'ANALYST', firstName: 'Ifeoluwa', lastName: 'Bankole' },
      { local: 'supervisor', role: 'SUPERVISOR', firstName: 'Tunde', lastName: 'Kuforiji' },
      { local: 'auditor', role: 'AUDIT_OFFICER', firstName: 'Morayo', lastName: 'Shodipo' },
      { local: 'dpo', role: 'DPO', firstName: 'Segun', lastName: 'Onabanjo' },
    ],
  },

  fctirs: {
    database: 'findata_demo_fct',
    name: 'FEDERAL CAPITAL TERRITORY INTERNAL REVENUE SERVICE',
    shortName: 'FCT-IRS',
    emailDomain: 'fctirs.gov.ng',
    logoFile: 'fctirs-logo.b64',

    homeAuthority: 'FCT-IRS',
    homeStates: ['FCT', 'ABUJA', 'FEDERAL CAPITAL TERRITORY'],
    homeTerritoryLabel: 'FCT',

    residentState: 'FCT',
    // The FCT has six Area Councils, not LGAs.
    localities: ['Abaji', 'Abuja Municipal (AMAC)', 'Bwari', 'Gwagwalada', 'Kuje', 'Kwali'],
    placeNames: ['Maitama', 'Asokoro', 'Wuse', 'Garki', 'Gwarinpa', 'Jabi', 'Utako', 'Lugbe',
      'Kubwa', 'Karu', 'Durumi', 'Jahi', 'Katampe', 'Apo', 'Gudu', 'Lokogoma', 'Idu', 'Dawaki',
      'Life Camp', 'Wuye'],
    // Abuja's population is drawn from the whole country, so the name pool is mixed
    // rather than weighted to one region.
    firstNames: ['Aisha', 'Chukwuemeka', 'Ibrahim', 'Ngozi', 'Suleiman', 'Blessing', 'Yakubu',
      'Chiamaka', 'Nasiru', 'Hauwa', 'Emeka', 'Zainab', 'Oluwafemi', 'Halima', 'Terseer',
      'Amina', 'Obinna', 'Danladi', 'Rukayat', 'Gbenga', 'Fatima', 'Kelechi'],
    lastNames: ['Mohammed', 'Okoro', 'Lawal', 'Adamu', 'Chukwu', 'Garba', 'Onyeka', 'Sadiq',
      'Iorwuese', 'Yusuf', 'Agboola', 'Maikudi', 'Nwachukwu', 'Jibrin', 'Ogbonna', 'Shuaibu',
      ...SHARED_LAST],
    staff: [
      { local: 'admin', role: 'SUPER_ADMIN', firstName: 'Aisha', lastName: 'Mohammed' },
      { local: 'analyst', role: 'ANALYST', firstName: 'Chukwuemeka', lastName: 'Okoro' },
      { local: 'supervisor', role: 'SUPERVISOR', firstName: 'Ibrahim', lastName: 'Lawal' },
      { local: 'auditor', role: 'AUDIT_OFFICER', firstName: 'Ngozi', lastName: 'Adamu' },
      { local: 'dpo', role: 'DPO', firstName: 'Suleiman', lastName: 'Garba' },
    ],
  },

  tirs: {
    database: 'findata_demo_taraba',
    name: 'TARABA STATE INTERNAL REVENUE SERVICE',
    shortName: 'TIRS',
    emailDomain: 'tirs.tarabastate.gov.ng',
    logoFile: null,

    homeAuthority: 'Taraba State IRS',
    homeStates: ['TARABA'],
    homeTerritoryLabel: 'Taraba',

    residentState: 'Taraba',
    // Taraba's 16 Local Government Areas.
    localities: ['Ardo-Kola', 'Bali', 'Donga', 'Gashaka', 'Gassol', 'Ibi', 'Jalingo', 'Karim Lamido',
      'Kurmi', 'Lau', 'Sardauna', 'Takum', 'Ussa', 'Wukari', 'Yorro', 'Zing'],
    placeNames: ['Jalingo', 'Wukari', 'Takum', 'Bali', 'Gembu', 'Mutum Biyu', 'Zing', 'Ibi',
      'Serti', 'Lau', 'Donga', 'Gassol', 'Yorro', 'Kurmi', 'Bantaje', 'Gashaka'],
    firstNames: ['Danladi', 'Hauwa', 'Jonathan', 'Amina', 'Musa', 'Rebecca', 'Joseph', 'Ladi',
      'Emmanuel', 'Naomi', 'Yakubu', 'Grace', 'Dauda', 'Salamatu', 'Habila', 'Rahila', 'Audu',
      'Mary', 'Bitrus', 'Rifkatu', 'Suleiman', 'Gideon'],
    lastNames: ['Kefas', 'Danjuma', 'Bello', 'Garba', 'Adamu', 'Ishaku', 'Yusuf', 'Audu', 'Tanko',
      'Haruna', 'Gambo', 'Jibrin', 'Sunday', 'Nuhu', 'Maigari', 'Abubakar', 'Musa', 'Yohanna'],
    staff: [
      { local: 'admin', role: 'SUPER_ADMIN', firstName: 'Danladi', lastName: 'Kefas' },
      { local: 'analyst', role: 'ANALYST', firstName: 'Hauwa', lastName: 'Garba' },
      { local: 'supervisor', role: 'SUPERVISOR', firstName: 'Jonathan', lastName: 'Ishaku' },
      { local: 'auditor', role: 'AUDIT_OFFICER', firstName: 'Amina', lastName: 'Bello' },
      { local: 'dpo', role: 'DPO', firstName: 'Musa', lastName: 'Tanko' },
    ],
  },
};

/**
 * States used for the slice of taxpayers who bank in the territory but live
 * elsewhere. These are the genuine §15 referral candidates, and without them the
 * Cross-State screen has nothing to show.
 */
// Deliberately excludes any state whose revenue authority is an existing client:
// a referral row reading "<State> IRS" in a demo for someone else reads as a
// reference to that client, however incidental.
export const NEIGHBOUR_STATES = ['Lagos', 'Oyo', 'Kaduna', 'Rivers', 'Niger',
  'Nasarawa', 'Anambra', 'Edo', 'Plateau', 'Enugu', 'Delta', 'Benue'];

export function resolveAuthority(key?: string): AuthorityProfile {
  const k = (key || 'ogirs').toLowerCase();
  const p = AUTHORITIES[k];
  if (!p) {
    throw new Error(`Unknown DEMO_AUTHORITY "${key}". Known: ${Object.keys(AUTHORITIES).join(', ')}`);
  }
  return p;
}
