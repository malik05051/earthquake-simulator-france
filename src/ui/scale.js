// Display intensity scale: EMS-98 (default) or the Japan Meteorological Agency shindo scale.
// The simulation always works in EMS-98; shindo values are an approximate conversion
// (JMA instrumental intensity ≈ 0.8 × EMS − 1.2), good enough to compare the two scales.
import { CLASSES as EMS, CLASS_COLOR as EMS_COLOR, CLASS_TEXT as EMS_TEXT, CLASS_DESC as EMS_DESC } from '../sim/intensity.js';
import { getLang } from './i18n.js';

const JMA = ['0', '1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'];
const JMA_LOWER = [0.5, 1.5, 2.5, 3.5, 4.5, 5.0, 5.5, 6.0, 6.5];
const JMA_COLOR = {
  0: '#9aa4ae', 1: '#2f88d0', 2: '#23a98c', 3: '#e8c547', 4: '#f08a24',
  '5-': '#e5532b', '5+': '#c81e2a', '6-': '#a51d58', '6+': '#86197a', 7: '#55107a',
};
const JMA_TEXT = { 0: '#1b1b1b', 1: '#fff', 2: '#fff', 3: '#1b1b1b', 4: '#1b1b1b', '5-': '#fff', '5+': '#fff', '6-': '#fff', '6+': '#fff', 7: '#fff' };
const JMA_DESC = {
  fr: {
    0: 'Non ressenti', 1: 'Ressenti par quelques-uns', 2: 'Ressenti par beaucoup', 3: 'Ressenti par presque tous',
    4: 'Objets qui tombent', '5-': 'Mobilier qui bouge', '5+': 'Difficile de marcher', '6-': 'Impossible de rester debout',
    '6+': 'Bâtiments fragiles détruits', 7: 'Destructions étendues',
  },
  en: {
    0: 'Not felt', 1: 'Felt by a few', 2: 'Felt by many', 3: 'Felt by nearly all', 4: 'Objects fall',
    '5-': 'Furniture moves', '5+': 'Hard to walk', '6-': 'Impossible to stand', '6+': 'Weak buildings collapse', 7: 'Widespread destruction',
  },
};
const JMA_NAME = {
  fr: { '5-': '5 faible', '5+': '5 fort', '6-': '6 faible', '6+': '6 fort' },
  en: { '5-': '5 lower', '5+': '5 upper', '6-': '6 lower', '6+': '6 upper' },
};

let current = 'ems';
export function setScale(s) { current = s === 'jma' ? 'jma' : 'ems'; }
export function getScale() { return current; }
export const isJma = () => current === 'jma';

export function emsToJmaInstrumental(ems) { return 0.8 * ems - 1.2; }

// Continuous EMS intensity -> class key of the current scale (null when not felt).
export function fromEms(i) {
  if (!(i >= 1.5)) return null; // EMS I = not felt
  if (current === 'ems') return EMS[Math.min(12, Math.round(i))];
  const j = emsToJmaInstrumental(i);
  let k = 0;
  while (k < JMA_LOWER.length && j >= JMA_LOWER[k]) k++;
  return k === 0 ? null : JMA[k];
}

// EMS class key ('VII') or integer class (7) -> key of the current scale.
export function fromEmsClass(c) {
  const k = typeof c === 'number' ? c : EMS.indexOf(c ?? '');
  return k > 0 ? fromEms(k) : null;
}

export function keys() { return current === 'ems' ? EMS.slice(2, 11) : JMA.slice(1); }
export function allKeys() { return current === 'ems' ? EMS.slice(1) : JMA; }
export function rank(key) { return key == null ? 0 : allKeys().indexOf(key) + (current === 'ems' ? 1 : 0); }
export function color(key) { return current === 'ems' ? EMS_COLOR[key] : JMA_COLOR[key]; }
export function text(key) { return current === 'ems' ? EMS_TEXT[key] : JMA_TEXT[key]; }
export function desc(key) { return current === 'ems' ? EMS_DESC[getLang()][key] : JMA_DESC[getLang()][key]; }

// HTML for a class value (shindo 5-/5+ use a superscript sign).
export function valueHtml(key) {
  if (!key) return '?';
  if (current === 'ems') return key;
  const mod = key[1] === '-' ? '−' : key[1] === '+' ? '+' : '';
  return `${key[0]}${mod ? `<sup>${mod}</sup>` : ''}`;
}

// Words for speech ("VII", "shindo 5 upper" / "shindo 5 fort").
export function spoken(key) {
  if (!key) return '?';
  if (current === 'ems') return key;
  return `shindo ${JMA_NAME[getLang()][key] ?? key}`;
}

export function shortName() { return current === 'ems' ? 'EMS' : (getLang() === 'fr' ? 'Shindo' : 'Shindo'); }
export function fontClass() { return current === 'ems' ? 'roman' : 'shindo'; }
