import AO from 'country-flag-icons/react/3x2/AO';
import AR from 'country-flag-icons/react/3x2/AR';
import AT from 'country-flag-icons/react/3x2/AT';
import AU from 'country-flag-icons/react/3x2/AU';
import BA from 'country-flag-icons/react/3x2/BA';
import BE from 'country-flag-icons/react/3x2/BE';
import BG from 'country-flag-icons/react/3x2/BG';
import BR from 'country-flag-icons/react/3x2/BR';
import CA from 'country-flag-icons/react/3x2/CA';
import CH from 'country-flag-icons/react/3x2/CH';
import CI from 'country-flag-icons/react/3x2/CI';
import CL from 'country-flag-icons/react/3x2/CL';
import CM from 'country-flag-icons/react/3x2/CM';
import CO from 'country-flag-icons/react/3x2/CO';
import CR from 'country-flag-icons/react/3x2/CR';
import CZ from 'country-flag-icons/react/3x2/CZ';
import DE from 'country-flag-icons/react/3x2/DE';
import DK from 'country-flag-icons/react/3x2/DK';
import DZ from 'country-flag-icons/react/3x2/DZ';
import EC from 'country-flag-icons/react/3x2/EC';
import EG from 'country-flag-icons/react/3x2/EG';
import ES from 'country-flag-icons/react/3x2/ES';
import FR from 'country-flag-icons/react/3x2/FR';
import GBENG from 'country-flag-icons/react/3x2/GB-ENG';
import GBSCT from 'country-flag-icons/react/3x2/GB-SCT';
import GBWLS from 'country-flag-icons/react/3x2/GB-WLS';
import GH from 'country-flag-icons/react/3x2/GH';
import GR from 'country-flag-icons/react/3x2/GR';
import HN from 'country-flag-icons/react/3x2/HN';
import HR from 'country-flag-icons/react/3x2/HR';
import IR from 'country-flag-icons/react/3x2/IR';
import IS from 'country-flag-icons/react/3x2/IS';
import IT from 'country-flag-icons/react/3x2/IT';
import JM from 'country-flag-icons/react/3x2/JM';
import JP from 'country-flag-icons/react/3x2/JP';
import KP from 'country-flag-icons/react/3x2/KP';
import KR from 'country-flag-icons/react/3x2/KR';
import MA from 'country-flag-icons/react/3x2/MA';
import MX from 'country-flag-icons/react/3x2/MX';
import NG from 'country-flag-icons/react/3x2/NG';
import NL from 'country-flag-icons/react/3x2/NL';
import NO from 'country-flag-icons/react/3x2/NO';
import NZ from 'country-flag-icons/react/3x2/NZ';
import PA from 'country-flag-icons/react/3x2/PA';
import PE from 'country-flag-icons/react/3x2/PE';
import PL from 'country-flag-icons/react/3x2/PL';
import PT from 'country-flag-icons/react/3x2/PT';
import PY from 'country-flag-icons/react/3x2/PY';
import QA from 'country-flag-icons/react/3x2/QA';
import RO from 'country-flag-icons/react/3x2/RO';
import RS from 'country-flag-icons/react/3x2/RS';
import RU from 'country-flag-icons/react/3x2/RU';
import SA from 'country-flag-icons/react/3x2/SA';
import SE from 'country-flag-icons/react/3x2/SE';
import SI from 'country-flag-icons/react/3x2/SI';
import SK from 'country-flag-icons/react/3x2/SK';
import SN from 'country-flag-icons/react/3x2/SN';
import TG from 'country-flag-icons/react/3x2/TG';
import TN from 'country-flag-icons/react/3x2/TN';
import TT from 'country-flag-icons/react/3x2/TT';
import UA from 'country-flag-icons/react/3x2/UA';
import US from 'country-flag-icons/react/3x2/US';
import UY from 'country-flag-icons/react/3x2/UY';
import ZA from 'country-flag-icons/react/3x2/ZA';

/** FIFA 3-letter code -> SVG flag component (country-flag-icons' own type). */
const BY_FIFA: Record<string, typeof BR> = {
  BRA: BR, FRA: FR, ITA: IT, NED: NL, GER: DE, ARG: AR, QAT: QA, ECU: EC, SEN: SN,
  ENG: GBENG, IRN: IR, USA: US, WAL: GBWLS, KSA: SA, MEX: MX, POL: PL, AUS: AU,
  DEN: DK, TUN: TN, ESP: ES, CRC: CR, JPN: JP, BEL: BE, CAN: CA, MAR: MA, CRO: HR,
  SRB: RS, SUI: CH, CMR: CM, POR: PT, GHA: GH, URU: UY, KOR: KR,
  RUS: RU, EGY: EG, PER: PE, ISL: IS, NGA: NG, PAN: PA, SWE: SE, COL: CO,
  CHI: CL, GRE: GR, CIV: CI, HON: HN, BIH: BA, ALG: DZ,
  PAR: PY, TRI: TT, ANG: AO, CZE: CZ, TOG: TG, UKR: UA, RSA: ZA,
  SVN: SI, NZL: NZ, SVK: SK, PRK: KP, SCG: RS,
  // 1998 nations. YUG (FR Yugoslavia) has no flag in country-flag-icons; use the
  // Serbia flag as the closest real successor, matching how SCG is handled.
  SCO: GBSCT, NOR: NO, AUT: AT, BUL: BG, ROU: RO, JAM: JM, YUG: RS,
};

interface Props {
  /** FIFA 3-letter code (ignored when isUser). */
  code: string;
  isUser?: boolean;
  /** Sizing classes; a 3:2 ratio (e.g. h-4 w-6). */
  className?: string;
}

/** A nation flag (SVG) for the given code, or a "YOU" badge for the user team. */
export default function Flag({ code, isUser = false, className = 'h-4 w-6' }: Props) {
  if (isUser) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded bg-red-600 text-[9px] font-black leading-none text-white ${className}`}
      >
        YOU
      </span>
    );
  }
  const F = BY_FIFA[code];
  // Only ever display real flags - no code-box fallback.
  if (!F) return null;
  return (
    <span className={`inline-flex shrink-0 overflow-hidden rounded-[2px] ${className}`}>
      <F title={code} className="block h-full w-full" />
    </span>
  );
}
