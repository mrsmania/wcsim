// Nation-to-confederation reference data for the squad dataset. Lives in data/
// (not domain/) because it describes the dataset itself: chemistry reads it for
// the "Same continent" category, and validateSquads asserts every squad code in
// the dataset is mapped here.

export type Confederation = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';

/** Nation code -> confederation. A miss returns `undefined`, so callers must
 *  guard the lookup (validateSquads asserts every squad code is mapped). */
export const CONFEDERATION: Record<string, Confederation | undefined> = {
  // UEFA
  FRA: 'UEFA', ITA: 'UEFA', NED: 'UEFA', GER: 'UEFA', ESP: 'UEFA', ENG: 'UEFA',
  POR: 'UEFA', BEL: 'UEFA', CRO: 'UEFA', SRB: 'UEFA', SUI: 'UEFA', DEN: 'UEFA',
  POL: 'UEFA', WAL: 'UEFA', SVN: 'UEFA', SVK: 'UEFA', GRE: 'UEFA', RUS: 'UEFA',
  BIH: 'UEFA', ISL: 'UEFA', SWE: 'UEFA', SCG: 'UEFA', CZE: 'UEFA', UKR: 'UEFA',
  YUG: 'UEFA', // FR Yugoslavia (1998 / 2002)
  SCO: 'UEFA', NOR: 'UEFA', AUT: 'UEFA', BUL: 'UEFA', ROU: 'UEFA', // 1998 qualifiers
  // CONMEBOL
  BRA: 'CONMEBOL', ARG: 'CONMEBOL', URU: 'CONMEBOL', COL: 'CONMEBOL',
  ECU: 'CONMEBOL', CHI: 'CONMEBOL', PER: 'CONMEBOL', PAR: 'CONMEBOL',
  // CONCACAF
  MEX: 'CONCACAF', USA: 'CONCACAF', CRC: 'CONCACAF', CAN: 'CONCACAF',
  HON: 'CONCACAF', PAN: 'CONCACAF', TRI: 'CONCACAF', JAM: 'CONCACAF',
  // CAF
  SEN: 'CAF', CMR: 'CAF', MAR: 'CAF', TUN: 'CAF', GHA: 'CAF', NGA: 'CAF',
  CIV: 'CAF', EGY: 'CAF', ALG: 'CAF', RSA: 'CAF', ANG: 'CAF', TOG: 'CAF',
  // AFC (Australia has competed in the AFC since 2006)
  KSA: 'AFC', IRN: 'AFC', JPN: 'AFC', KOR: 'AFC', QAT: 'AFC', AUS: 'AFC', PRK: 'AFC',
  // OFC
  NZL: 'OFC',
};
