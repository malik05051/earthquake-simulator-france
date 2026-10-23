// Sidebar cards for the France app (all text goes through i18n).
import { CLASSES, CLASS_COLOR, CLASS_TEXT, CLASS_DESC, classOf } from '../sim/intensity.js';
import { badgeHtml, TSUNAMI_COLOR } from './map.js';
import { t, getLang } from './i18n.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const p2 = (n) => String(n).padStart(2, '0');

export function fmtTime(d, sec = true) { return `${p2(d.getHours())}:${p2(d.getMinutes())}${sec ? ':' + p2(d.getSeconds()) : ''}`; }
export function fmtDate(d) {
  return getLang() === 'fr' ? `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

function bigBox(cls, label) {
  const bg = cls ? CLASS_COLOR[cls] : '#3a4552';
  const fg = cls ? CLASS_TEXT[cls] : '#cfd8e3';
  const desc = cls ? `<span class="bb-desc">${CLASS_DESC[getLang()][cls]}</span>` : '';
  return `<div class="bigbox" style="background:${bg};color:${fg}"><span class="bb-label">${label}${desc}</span><span class="bb-value roman">${cls || '?'}</span></div>`;
}

function magColor(m) { return m >= 6 ? '#c43ad6' : m >= 5 ? '#ef2f2f' : m >= 4 ? '#f08a24' : m >= 3 ? '#f5d327' : '#45a8f5'; }
function depthColor(d) { return d < 10 ? '#ef2f2f' : d < 20 ? '#f08a24' : d < 40 ? '#f5d327' : '#45a8f5'; }
export function depthText(d) { return d <= 0 ? t('veryShallow') : `${Math.round(d)} km`; }
function magDepth(mag, depth, magLabel = t('magnitude')) {
  const m = getLang() === 'fr' ? mag.toFixed(1).replace('.', ',') : mag.toFixed(1);
  return `
    <div class="mrow"><span>${magLabel}</span><b>${m}</b><i style="background:${magColor(mag)}"></i></div>
    <div class="mrow"><span>${t('depth')}</span><b>${depthText(depth)}</b><i style="background:${depthColor(depth)}"></i></div>`;
}
const deptName = (code, ctx) => ctx.depByCode.get(code)?.properties.name ?? code;

// ---------------------------------------------------------------- real-time view
export function eewCard(r, ctx) {
  const tag = `${r.isAlert ? t('eewAlert') : t('eewInfo')} ${r.isFinal ? t('eewFinal') : '#' + r.serial}`;
  const place = ctx.sim.label(r.lat, r.lon, getLang());
  return `
  <div class="card">
    <div class="card-head ${r.isAlert ? 'warning' : 'forecast'}">${t('eewTitle')}<span class="tag">${tag}</span></div>
    <div class="card-body">
      <div class="place">${esc(place)}</div>
      <div class="sub">${t('occurred', { date: fmtDate(ctx.clock(0)), time: fmtTime(ctx.clock(0)) })}</div>
      ${bigBox(r.maxClass, t('estMax'))}
      ${magDepth(r.mag, r.depth)}
      ${r.isAlert ? `<div class="alertnote">${t('eewStrong')}</div>` : ''}
      <div class="sub fine">${t('eewNote')}</div>
    </div>
  </div>`;
}

export function shakingCard(list, ctx) {
  const top = list.length ? classOf(list[0].i) : null;
  const rows = list.slice(0, 8).map((x) => `<div class="area-row">${badgeHtml(classOf(x.i))}<span class="names">${esc(deptName(x.code, ctx))}</span></div>`).join('');
  return `
  <div class="card">
    <div class="card-head">${t('shaking')}</div>
    <div class="card-body">
      ${bigBox(top, t('rtMax'))}
      <div class="areas">${rows || `<span class="sub">${t('waitingWaves')}</span>`}</div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- info view
export function infoCard(rep, ctx) {
  const { q, sim } = ctx;
  const origin = ctx.clock(0);
  const place = sim.label(q.lat, q.lon, getLang());
  const tsIssued = sim.tsunami.level !== 'none' && ctx.t >= sim.tsunami.at;
  const ts = sim.tsunami.level === 'none'
    ? `<div class="tsunote none">${t('tsunamiNone')}</div>`
    : tsIssued ? `<div class="tsunote alert">${t('tsunamiActive')}</div>` : `<div class="tsunote">${t('tsunamiPending')}</div>`;
  const title = { auto: t('autoLoc'), felt: t('felt'), final: t('final') }[rep.type];
  const showMax = rep.type !== 'auto';
  return `
  <div class="card">
    <div class="card-head"><span class="ico">i</span>${title}</div>
    <div class="card-body">
      ${showMax ? bigBox(q.maxClass, t('maxIntensity')) : ''}
      <div class="sub">${t('aroundTime', { time: `${fmtDate(origin)} ${fmtTime(origin, false)}` })}</div>
      <div class="place">${esc(place)}</div>
      ${q.dept ? `<div class="sub">${esc(q.dept.name)} (${esc(q.dept.code)})</div>` : ''}
      ${magDepth(rep.mag ?? q.mag, q.depth, rep.type === 'auto' ? t('magAuto') : `${t('magnitude')} (${rep.magType ?? 'Mw'})`)}
      ${ts}
      <div class="sub fine">${t('source')}</div>
    </div>
  </div>`;
}

export function deptListCard(regions, ctx) {
  const groups = new Map();
  for (const [code, k] of regions) {
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(code);
  }
  const rows = [...groups.keys()].sort((a, b) => b - a).map((k) => `
    <div class="area-row">${badgeHtml(CLASSES[k])}<span class="names">${esc(groups.get(k).map((c) => deptName(c, ctx)).sort().join(', '))}</span></div>`).join('');
  return `<div class="card"><div class="card-head">${t('byDept')}</div><div class="card-body"><div class="areas tall">${rows}</div></div></div>`;
}

// ---------------------------------------------------------------- tsunami view
export function tsunamiCard(ts, ctx, now) {
  const { q } = ctx;
  const origin = ctx.clock(0);
  const groups = ['alerte', 'vigilance', 'information'].map((lvl) => {
    const list = [...ts.areas.entries()].filter(([, a]) => a.level === lvl).sort((a, b) => a[1].arrivalMin - b[1].arrivalMin);
    if (!list.length) return '';
    const items = list.map(([code, a]) => {
      const arrive = now >= a.arrivalMin * 60
        ? `<span class="pill-y">${t('arrivingNow')}</span>`
        : `<span class="pill-d">${t('expected', { time: fmtTime(ctx.clock(a.arrivalMin * 60), false) })}</span>`;
      return `<div class="tsu-item"><div>${esc(deptName(code, ctx))} (${esc(code)})</div>${arrive}</div>`;
    }).join('');
    return `
      <div class="tsu-group" style="--c:${TSUNAMI_COLOR[lvl]}">
        <div class="tsu-title">${t('tsunamiShort')[lvl]}</div>
        <div class="sub">${t('tsunamiAdvice')[lvl]}</div>
        <div class="tsu-list">${items}</div>
      </div>`;
  }).join('');
  return `
  <div class="card">
    <div class="card-head" style="background:${TSUNAMI_COLOR[ts.level]};${ts.level === 'information' ? 'color:#1b1b1b' : ''}">${t('tsunamiTitle')[ts.level]}</div>
    <div class="card-body">
      <div class="sub">${t('aroundTime', { time: `${fmtDate(origin)} ${fmtTime(origin, false)}` })}</div>
      <div class="place">${esc(ctx.sim.label(q.lat, q.lon, getLang()))}</div>
      ${magDepth(q.mag, q.depth)}
      ${groups}
    </div>
  </div>`;
}

export function noTsunamiCard() {
  return `<div class="card"><div class="card-head">${t('tsunamiInfo')}</div><div class="card-body"><div class="sub">${t('tsunamiNoneLong')}</div></div></div>`;
}

export function idleCard(title = t('noQuake')) {
  return `
  <div class="card">
    <div class="card-head"><span class="ico">i</span>${t('autoLoc')}</div>
    <div class="card-body">
      ${bigBox(null, t('maxIntensity'))}
      <div class="place">${title}</div>
      <div class="sub">${t('noQuakeHint')}</div>
    </div>
  </div>`;
}

export function historyItem(h, active) {
  const d = new Date(h.origin);
  const cls = h.maxClass;
  const mag = getLang() === 'fr' ? h.mag.toFixed(1).replace('.', ',') : h.mag.toFixed(1);
  return `
  <div class="hist ${active ? 'active' : ''}" data-id="${h.id}">
    <div class="hbox" style="background:${cls ? CLASS_COLOR[cls] : '#3a4552'};color:${cls ? CLASS_TEXT[cls] : '#cfd8e3'}"><span>EMS</span><b class="roman">${cls || '–'}</b></div>
    <div class="info">
      <div class="name">${esc(h.name)}</div>
      <div class="line2">${fmtDate(d)} ${fmtTime(d, false)}</div>
      <div class="line3"><span>${t('depth')} ${depthText(h.depth)}</span><i style="background:${depthColor(h.depth)}"></i><span class="mag">M ${mag}</span><i style="background:${magColor(h.mag)}"></i></div>
    </div>
  </div>`;
}

export function legendHtml(view) {
  if (view === 'tsunami') {
    return `<div class="lg-title">${t('coastColours')}</div>` + ['alerte', 'vigilance', 'information'].map((l) =>
      `<div class="lg-row"><i style="background:${TSUNAMI_COLOR[l]}"></i>${t('tsunamiShort')[l]}</div>`).join('');
  }
  const title = view === 'realtime' ? t('mapForecast') : t('mapColours');
  return `<div class="lg-title">${title}</div>` + CLASSES.slice(2, 11).reverse().map((c) =>
    `<div class="lg-row"><i style="background:${CLASS_COLOR[c]}"></i><b class="roman">${c}</b> ${CLASS_DESC[getLang()][c]}</div>`).join('');
}
