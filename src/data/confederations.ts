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
  TUR: 'UEFA', IRL: 'UEFA', // 2002 qualifiers
  TCH: 'UEFA', URS: 'UEFA', // 1990 (Czechoslovakia, Soviet Union)
  HUN: 'UEFA', NIR: 'UEFA', // 1986
  GDR: 'UEFA', // 1974 (East Germany)
  // Israel played 1970 through the AFC/OFC qualifying zone and was expelled from the AFC
  // in 1974, but this table records CURRENT affiliation - the same choice Australia gets,
  // which is listed under AFC despite qualifying for 1974 as an OFC member.
  ISR: 'UEFA', // 1970
  // CONMEBOL
  BRA: 'CONMEBOL', ARG: 'CONMEBOL', URU: 'CONMEBOL', COL: 'CONMEBOL',
  ECU: 'CONMEBOL', CHI: 'CONMEBOL', PER: 'CONMEBOL', PAR: 'CONMEBOL',
  BOL: 'CONMEBOL', // 1994
  // CONCACAF
  MEX: 'CONCACAF', USA: 'CONCACAF', CRC: 'CONCACAF', CAN: 'CONCACAF',
  HON: 'CONCACAF', PAN: 'CONCACAF', TRI: 'CONCACAF', JAM: 'CONCACAF',
  SLV: 'CONCACAF', // 1982
  HAI: 'CONCACAF', // 1974
  // CAF
  SEN: 'CAF', CMR: 'CAF', MAR: 'CAF', TUN: 'CAF', GHA: 'CAF', NGA: 'CAF',
  CIV: 'CAF', EGY: 'CAF', ALG: 'CAF', RSA: 'CAF', ANG: 'CAF', TOG: 'CAF',
  ZAI: 'CAF', // 1974 (Zaire)
  // AFC (Australia has competed in the AFC since 2006)
  KSA: 'AFC', IRN: 'AFC', JPN: 'AFC', KOR: 'AFC', QAT: 'AFC', AUS: 'AFC', PRK: 'AFC',
  CHN: 'AFC', // 2002
  UAE: 'AFC', // 1990
  IRQ: 'AFC', // 1986
  KUW: 'AFC', // 1982
  // OFC
  NZL: 'OFC',
};
