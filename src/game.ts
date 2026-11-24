// The game engine. Every mutator here works on a draft copy of the state inside commit().

export const KEY = 'poker-chip-tracker:v1';
export const AV = ['#B3312B', '#2E7D4F', '#2B4C8C', '#6B3FA0', '#B9771F', '#1F7A7A', '#8C2D5E', '#4A5A2A', '#33475B', '#A0522D'];
export const CHIPC = ['#B3312B', '#2E7D4F', '#1E1E1E', '#6B3FA0', '#B9771F', '#2B4C8C'];
export const STREETS = ['Pre-flop', 'Flop', 'Turn', 'River', 'Showdown'];
export const RAISE_RULES = {
  min: 'The smallest raise allowed', x2: 'Double the current bet', x3: 'Triple the current bet',
  half: 'Half the pot', pot: 'The size of the pot',
};
export type RaiseKey = keyof typeof RAISE_RULES;

export type Player = { id: number; name: string; stack: number; buyIn: number; color: string; out: boolean };
export type Seat = { bet: number; put: number; folded: boolean; allIn: boolean; acted: boolean; last: string };
export type Hand = {
  n: number; street: number; seats: number[]; d: number; sb: number; bb: number; bbAmt: number;
  curBet: number; minRaise: number; turn: number | null; prevButton: number | null; p: Record<number, Seat>;
};
export type Settings = { start: number; value: number; denoms: number[]; sb: number; bb: number; raise: RaiseKey };
export type LogEntry = { hand: number; msg: string };
export type Game = {
  players: Player[]; pot: number; hand: number; seq: number; button: number | null; btnNext: number | null;
  H: Hand | null; last: string; settings: Settings; log: LogEntry[];
};
export type Pot = { amount: number; eligible: number[]; solo: boolean };
export type ActKind = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export const fresh = (): Game => ({
  players: [], pot: 0, hand: 1, seq: 1, button: null, btnNext: null, H: null, last: '',
  settings: { start: 1000, value: 0.05, denoms: [5, 25, 100, 500], sb: 5, bb: 10, raise: 'x2' }, log: [],
});

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
export const money = (n: number) => (n < -0.004 ? '−' : '') + '$' + Math.abs(n).toFixed(2);
export const short = (d: number) => (d >= 1000 ? d / 1000 + 'K' : String(d));
// "1,500" or "$0.25" should read as numbers, not as 0
export const num = (s: string | number) => +String(s).replace(/[^\d.]/g, '') || 0;
export const andList = (a: string[]) => (a.length < 2 ? a[0] || '' : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
export const P = (g: Game, id: number) => g.players.find(p => p.id === id)!;

/* ---------- commit: run a mutator on a copy, logging its notes ---------- */
let notes: string[] = [];
export const note = (m: string) => { notes.push(m); };
export function runCommit(g: Game, msg: string, fn: (d: Game) => void): Game {
  const d = structuredClone(g);
  const handNo = d.H ? d.H.n : d.hand;
  notes = msg ? [msg] : [];
  fn(d);
  notes.forEach(m => d.log.unshift({ hand: handNo, msg: m }));
  if (d.log.length > 300) d.log.length = 300;
  notes = [];
  return d;
}

/* ---------- the hand: button, blinds, turns, pots ---------- */
export const potTotal = (g: Game) => g.pot + (g.H ? Object.values(g.H.p).reduce((a, x) => a + x.put + x.bet, 0) : 0);
export const dealable = (g: Game) => g.players.filter(p => !p.out && p.stack > 0).map(p => p.id);
export const isLive = (g: Game, id: number) => !!(g.H && g.H.p[id] && !g.H.p[id].folded);
export const allMatched = (H: Hand) => H.seats.every(id => { const x = H.p[id]; return x.folded || x.allIn || x.bet === H.curBet; });

export type Positions = { seats: number[]; d: number; sb: number; bb: number };
// Who deals and posts blinds next hand. Seat order is the order of the list.
export function positions(g: Game): Positions | null {
  const seats = dealable(g); if (seats.length < 2) return null;
  let d = g.btnNext;
  if (d == null || !seats.includes(d)) {
    const order = g.players.map(p => p.id), i = g.button == null ? -1 : order.indexOf(g.button);
    d = seats[0];
    for (let k = 1; k <= order.length; k++) {
      const id = order[(i + k + order.length) % order.length];
      if (seats.includes(id)) { d = id; break; }
    }
  }
  const di = seats.indexOf(d), at = (k: number) => seats[(di + k) % seats.length];
  // heads-up, the dealer posts the small blind
  return seats.length === 2 ? { seats, d, sb: d, bb: at(1) } : { seats, d, sb: at(1), bb: at(2) };
}

function addBet(g: Game, id: number, a: number) {
  const p = P(g, id), x = g.H!.p[id];
  a = Math.max(0, Math.min(a, p.stack));
  p.stack -= a; x.bet += a;
  if (!p.stack) x.allIn = true;
  return a;
}
function needsToAct(H: Hand, id: number) {
  const x = H.p[id];
  return !x.folded && !x.allIn && (!x.acted || x.bet < H.curBet);
}
function nextToAct(H: Hand, from: number | null) {
  const s = H.seats, i = from == null ? -1 : s.indexOf(from);
  for (let k = 1; k <= s.length; k++) { const id = s[(i + k + s.length) % s.length]; if (needsToAct(H, id)) return id; }
  return null;
}
function advance(g: Game) {
  const H = g.H!, live = H.seats.filter(id => !H.p[id].folded);
  if (live.length === 1) return winByFold(g, live[0]);
  const n = nextToAct(H, H.turn);
  if (n != null) { H.turn = n; return; }
  endStreet(g);
}
function collectBets(H: Hand) {
  H.seats.forEach(id => { const x = H.p[id]; x.put += x.bet; x.bet = 0; x.acted = false; x.last = ''; });
  H.curBet = 0; H.minRaise = H.bbAmt;
}
function endStreet(g: Game) {
  const H = g.H!;
  collectBets(H);
  const canAct = H.seats.filter(id => !H.p[id].folded && !H.p[id].allIn);
  if (H.street >= 3 || canAct.length < 2) {
    H.street = 4; H.turn = null;
    note(`Showdown for ${fmt(potTotal(g))}`);
    return;
  }
  H.street++;
  H.turn = nextToAct(H, H.d);   // first player still in, left of the button
  note(`${STREETS[H.street]}, ${fmt(potTotal(g))} in the pot`);
}
function winByFold(g: Game, id: number) {
  const total = potTotal(g), p = P(g, id);
  p.stack += total;
  g.last = `${p.name} won ${fmt(total)}. Everyone else folded.`;
  note(`${p.name} wins ${fmt(total)}. Everyone else folded.`);
  g.H = null; g.hand++;
}

// Main pot and side pots. A side pot starts wherever a player still in the hand is all in;
// players who just haven't acted yet don't split anything.
export function potsNow(g: Game): Pot[] {
  const H = g.H; if (!H) return [];
  const es = Object.keys(H.p).map(k => { const x = H.p[+k]; return { id: +k, c: x.put + x.bet, live: !x.folded, allIn: x.allIn }; });
  type E = (typeof es)[number];
  const caps = [...new Set(es.filter(e => e.live && e.allIn && e.c > 0).map(e => e.c))].sort((a, b) => a - b);
  const pots: Pot[] = []; let prev = 0;
  const layer = (top: number, can: (e: E) => boolean): Pot => {
    let amount = 0, givers = 0;
    es.forEach(e => { const part = Math.max(0, Math.min(e.c, top) - prev); amount += part; if (part) givers++; });
    return { amount, eligible: H.seats.filter(id => es.some(e => e.id === id && can(e))), solo: givers === 1 };
  };
  caps.forEach(L => {
    const pt = layer(L, e => e.live && !(e.allIn && e.c < L));
    if (pt.amount) pots.push(pt);
    prev = L;
  });
  const top = layer(Infinity, e => e.live && !e.allIn);
  if (top.amount) {
    if (top.eligible.length) pots.push(top);
    else if (pots.length) { const last = pots[pots.length - 1]; last.amount += top.amount; last.solo = false; }
  }
  return pots;
}
export function sideText(g: Game) {
  const c = potsNow(g).filter(pt => pt.eligible.length > 1);
  if (c.length < 2) return '';
  return ` Main pot ${fmt(c[0].amount)}, side pot${c.length > 2 ? 's' : ''} ${andList(c.slice(1).map(pt => fmt(pt.amount)))}.`;
}

// Raise sizes for the player to act. Every size is a "raise to" total for this betting round.
export type RaiseSize = { k: RaiseKey; label: string; tip: string; v: number };
export type RaiseInfo = {
  can: true; opening: boolean; pot: number; full: number; min: number; max: number;
  sizes: RaiseSize[]; def: number; target: number; ok: boolean; short: boolean;
};
export function rinfo(g: Game, p: Player, ramt: number): RaiseInfo | { can: false } {
  const H = g.H!, x = H.p[p.id], max = x.bet + p.stack;
  if (max <= H.curBet) return { can: false };
  const opening = !H.curBet, pot = potTotal(g), toCall = Math.max(0, H.curBet - x.bet);
  const d = g.settings.denoms, unit = d.length ? Math.max(1, Math.min(...d)) : 1;
  const full = opening ? H.bbAmt : H.curBet + H.minRaise;   // smallest legal bet or raise
  const min = Math.min(max, full);
  const fit = (v: number) => Math.min(max, Math.max(min, Math.round(v / unit) * unit));
  const base = H.curBet || H.bbAmt;
  const sizes: RaiseSize[] = [
    { k: 'min', label: 'Min', tip: opening ? 'Smallest bet' : 'Smallest raise', v: min },
    { k: 'x2', label: opening ? '2 BB' : '2×', tip: opening ? 'Two big blinds' : 'Double the bet', v: fit(2 * base) },
    { k: 'x3', label: opening ? '3 BB' : '3×', tip: opening ? 'Three big blinds' : 'Triple the bet', v: fit(3 * base) },
    { k: 'half', label: '½ pot', tip: 'Half the pot', v: fit(H.curBet + (pot + toCall) / 2) },
    { k: 'pot', label: 'Pot', tip: 'The size of the pot', v: fit(H.curBet + pot + toCall) },
  ];
  const def = (sizes.find(s => s.k === g.settings.raise) || sizes[1]).v;
  const target = Math.min(ramt || def, max);
  const ok = target > H.curBet && (target >= min || target === max);
  return { can: true, opening, pot, full, min, max, sizes, def, target, ok, short: max < full };
}
export const raiseLabel = (r: RaiseInfo, p: Player) =>
  r.target >= r.max ? `All in ${fmt(p.stack)}` : `${r.opening ? 'Bet' : 'Raise to'} ${fmt(r.target)}`;

/* ---------- mutators ---------- */
export function addPlayerMut(g: Game, name: string, stack: number) {
  g.players.push({ id: g.seq++, name, stack, buyIn: stack, color: AV[g.players.length % AV.length], out: false });
}

export function dealMut(g: Game) {
  const pos = positions(g)!;
  const { sb, bb } = g.settings;
  const H: Hand = g.H = {
    n: g.hand, street: 0, seats: pos.seats, d: pos.d, sb: pos.sb, bb: pos.bb, bbAmt: bb,
    curBet: bb, minRaise: bb, turn: pos.bb, prevButton: g.button, p: {},
  };
  pos.seats.forEach(id => { H.p[id] = { bet: 0, put: 0, folded: false, allIn: false, acted: false, last: '' }; });
  g.button = pos.d; g.btnNext = null; g.last = '';
  const a = addBet(g, pos.sb, sb), c = addBet(g, pos.bb, bb);
  if (a) H.p[pos.sb].last = `Posted ${fmt(a)}`;
  H.p[pos.bb].last = `Posted ${fmt(c)}`;
  const dn = P(g, pos.d).name, sn = P(g, pos.sb).name, bn = P(g, pos.bb).name;
  note(pos.sb === pos.d ? `${dn} deals and posts ${fmt(a)}. ${bn} posts ${fmt(c)}.`
    : `${dn} deals. ${a ? `${sn} posts ${fmt(a)} and ` : ''}${bn} posts ${fmt(c)}.`);
  advance(g);   // first to act is left of the big blind
}

export function actMut(g: Game, id: number, kind: ActKind, target: number) {
  const H = g.H!, p = P(g, id), x = H.p[id], name = p.name;
  const toCall = Math.max(0, H.curBet - x.bet);
  if (kind === 'fold') { x.folded = true; x.last = 'Folded'; note(`${name} folds`); }
  else if (kind === 'check') { x.last = 'Checked'; note(`${name} checks`); }
  else if (kind === 'call') {
    const a = addBet(g, id, toCall);
    x.last = x.allIn ? 'All in' : `Called ${fmt(a)}`;
    note(x.allIn ? `${name} calls ${fmt(a)} and is all in` : `${name} calls ${fmt(a)}`);
  } else {
    const opening = !H.curBet;
    const a = addBet(g, id, (kind === 'allin' ? x.bet + p.stack : target) - x.bet);
    if (x.bet > H.curBet) {
      const inc = x.bet - H.curBet;
      if (inc >= H.minRaise) H.minRaise = inc;   // a full raise sets the next minimum
      H.curBet = x.bet;
    }
    if (x.allIn) { x.last = 'All in'; note(`${name} goes all in with ${fmt(a)}`); }
    else if (opening) { x.last = `Bet ${fmt(x.bet)}`; note(`${name} bets ${fmt(x.bet)}`); }
    else { x.last = `Raised to ${fmt(x.bet)}`; note(`${name} raises to ${fmt(x.bet)}`); }
  }
  x.acted = true;
  advance(g);
}

export function checkDownMut(g: Game) {
  const H = g.H!;
  collectBets(H); H.street = 4; H.turn = null;
}

export function misdealMut(g: Game) {
  const H = g.H!;
  Object.keys(H.p).forEach(k => { const p = g.players.find(q => q.id === +k), x = H.p[+k]; if (p) p.stack += x.put + x.bet; });
  g.button = H.prevButton; g.btnNext = H.d; g.H = null;
  g.last = 'Misdeal. Everyone got their chips back.';
  note(g.last);
}

// Pots to hand out right now: the live hand's pots, or chips left over from before.
export function awardablePots(g: Game): Pot[] | null {
  if (g.H) return potsNow(g);
  if (g.pot) {
    const ids = g.players.filter(p => !p.out).map(p => p.id);
    return [{ amount: g.pot, eligible: ids.length ? ids : g.players.map(p => p.id), solo: false }];
  }
  return null;
}

export function awardMut(g: Game, pots: Pot[], picks: number[][]) {
  const many = pots.filter(pt => pt.eligible.length > 1).length > 1;
  let ci = 0; const res: string[] = [];
  pots.forEach((pt, k) => {
    const ids = picks[k], share = Math.floor(pt.amount / ids.length), extra = pt.amount - share * ids.length;
    ids.forEach((id, j) => { P(g, id).stack += share + (j === 0 ? extra : 0); });
    const who = andList(ids.map(id => P(g, id).name));
    let m: string;
    if (pt.eligible.length === 1) m = pt.solo ? `${who} gets back ${fmt(pt.amount)}` : `${who} wins a side pot of ${fmt(pt.amount)}`;
    else {
      const label = many ? (ci ? 'a side pot of ' : 'the main pot of ') : ''; ci++;
      m = ids.length > 1 ? `${who} split ${label}${fmt(pt.amount)}` : `${who} wins ${label}${fmt(pt.amount)}`;
    }
    note(m); res.push(m);
  });
  g.last = res.join('. ') + '.';
  if (g.H) g.H = null; else g.pot = 0;
  g.hand++;
}

/* ---------- settle up ---------- */
export function settle(g: Game) {
  const v = g.settings.value;
  const rows = g.players.map(p => ({ p, net: p.stack - p.buyIn }));
  const tBuy = g.players.reduce((a, p) => a + p.buyIn, 0);
  const tChips = g.players.reduce((a, p) => a + p.stack, 0);
  const inPot = potTotal(g);
  let warn = '';
  if (inPot) warn = `${g.H ? `Hand ${g.H.n} is still going, with ${fmt(inPot)} chips in the pot.` : `There are ${fmt(inPot)} chips still in the pot.`} Finish it first for an accurate settle up.`;
  else if (tBuy !== tChips) warn = `Stacks add up to ${fmt(tChips)} but buy-ins total ${fmt(tBuy)}, a difference of ${fmt(Math.abs(tChips - tBuy))}. Check for a stack that needs fixing.`;

  // minimal-ish payments, in cents
  const cr: { n: string; c: number }[] = [], db: { n: string; c: number }[] = [];
  rows.forEach(r => { const c = Math.round(r.net * v * 100); if (c > 0) cr.push({ n: r.p.name, c }); if (c < 0) db.push({ n: r.p.name, c: -c }); });
  cr.sort((a, b) => b.c - a.c); db.sort((a, b) => b.c - a.c);
  const pays: { from: string; to: string; amount: number }[] = []; let i = 0, j = 0;
  while (i < db.length && j < cr.length) {
    const x = Math.min(db[i].c, cr[j].c);
    if (x > 0) pays.push({ from: db[i].n, to: cr[j].n, amount: x / 100 });
    db[i].c -= x; cr[j].c -= x;
    if (!db[i].c) i++;
    if (!cr[j].c) j++;
  }
  return { v, rows, warn, pays };
}

/* ---------- storage ---------- */
export function loadGame(): Game {
  try {
    const v = localStorage.getItem(KEY);
    if (v) { const d = JSON.parse(v); const g = Object.assign(fresh(), d); g.settings = Object.assign(fresh().settings, d.settings); return g; }
  } catch { /* nothing saved yet */ }
  return fresh();
}

/* ---------- export and load ---------- */
export const exportName = () => {
  const d = new Date(), z = (n: number) => String(n).padStart(2, '0');
  return `chip-tracker-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.json`;
};
export const exportText = (g: Game) => JSON.stringify({ app: 'chip-tracker', version: 2, exported: new Date().toISOString(), game: g }, null, 2);
export const exportedAt = (meta: { exported?: unknown } | null) => meta && typeof meta.exported === 'string' && !isNaN(Date.parse(meta.exported))
  ? new Date(meta.exported).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

/* eslint-disable @typescript-eslint/no-explicit-any -- parsing untrusted JSON */
// Files can come from anywhere, so every value is checked and rebuilt before the page uses it.
export function readGame(text: string): { game: Game; meta: any } {
  let d: any;
  try { d = JSON.parse(String(text).replace(/^﻿/, '')); }
  catch { throw new Error('That isn’t an exported game. The text isn’t valid JSON, so check that all of it was copied.'); }
  const meta = d && typeof d === 'object' && d.app === 'chip-tracker' && d.game && typeof d.game === 'object' ? d : null;
  const g = meta ? meta.game : d;
  if (!g || typeof g !== 'object' || !Array.isArray(g.players)) throw new Error('That isn’t an exported game. It has no list of players.');
  const bad = (why: string): never => { throw new Error(`This game file is damaged: ${why}.`); };
  const whole = (v: any, min: number) => typeof v === 'number' && isFinite(v) && Math.round(v) >= min;
  const def = fresh().settings, ids = new Set<number>();
  const players: Player[] = g.players.map((p: any, i: number) => {
    if (!p || typeof p !== 'object') bad(`player ${i + 1} is missing`);
    if (!Number.isInteger(p.id) || p.id < 1 || ids.has(p.id)) bad(`player ${i + 1} has a bad id`);
    ids.add(p.id);
    const name = typeof p.name === 'string' ? p.name.trim().slice(0, 60) : '';
    if (!name) bad(`player ${i + 1} has no name`);
    if (!whole(p.stack, 0) || !whole(p.buyIn, 0)) bad(`${name}’s chip count isn’t a number`);
    return { id: p.id, name, stack: Math.round(p.stack), buyIn: Math.round(p.buyIn),
      color: typeof p.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(p.color) ? p.color : AV[i % AV.length], out: p.out === true };
  });
  const s0 = g.settings && typeof g.settings === 'object' ? g.settings : {};
  const bb = whole(s0.bb, 1) ? Math.round(s0.bb) : def.bb;
  let denoms: number[] = Array.isArray(s0.denoms) ? s0.denoms.filter((v: any) => whole(v, 1)).map(Math.round).slice(0, 6) : [];
  if (!denoms.length) denoms = def.denoms;
  const settings: Settings = {
    start: whole(s0.start, 1) ? Math.round(s0.start) : def.start,
    value: typeof s0.value === 'number' && isFinite(s0.value) && s0.value >= 0 ? s0.value : def.value,
    denoms, bb, sb: Math.min(bb, whole(s0.sb, 0) ? Math.round(s0.sb) : def.sb),
    raise: typeof s0.raise === 'string' && Object.prototype.hasOwnProperty.call(RAISE_RULES, s0.raise) ? s0.raise : def.raise,
  };
  const seated = (v: any) => (Number.isInteger(v) && ids.has(v) ? v : null);
  const game: Game = {
    players, settings,
    pot: whole(g.pot, 0) ? Math.round(g.pot) : 0,
    hand: whole(g.hand, 1) ? Math.round(g.hand) : 1,
    seq: Math.max(whole(g.seq, 1) ? Math.round(g.seq) : 1, ...[...ids].map(id => id + 1)),
    button: seated(g.button), btnNext: seated(g.btnNext), H: null,
    last: typeof g.last === 'string' ? g.last.slice(0, 300) : '',
    log: Array.isArray(g.log) ? g.log.filter((l: any) => l && typeof l.msg === 'string').slice(0, 300)
      .map((l: any) => ({ hand: Number.isInteger(l.hand) && l.hand > 0 ? l.hand : 1, msg: l.msg.slice(0, 300) })) : [],
  };
  if (g.H != null) {
    if (game.pot) bad('it has chips in two pots at once');
    game.H = readHand(g.H, ids, bad);
    game.hand = game.H.n;
  }
  return { game, meta };
}
function readHand(h: any, ids: Set<number>, bad: (why: string) => never): Hand {
  if (typeof h !== 'object' || !Array.isArray(h.seats) || !h.p || typeof h.p !== 'object') bad('the hand in progress is incomplete');
  const seats: number[] = h.seats;
  if (seats.length < 2 || !seats.every(v => Number.isInteger(v) && v > 0) || new Set(seats).size !== seats.length) bad('the hand in progress has a bad seat list');
  const chips = (v: any) => typeof v === 'number' && isFinite(v) && v >= 0;
  const p: Record<number, Seat> = {};
  seats.forEach(id => {
    const x = h.p[id];
    if (!x || typeof x !== 'object' || !chips(x.bet) || !chips(x.put)) bad('someone’s bets in the hand in progress are missing');
    p[id] = { bet: Math.round(x.bet), put: Math.round(x.put), folded: x.folded === true, allIn: x.allIn === true, acted: x.acted === true,
      last: typeof x.last === 'string' ? x.last.slice(0, 40) : '' };
    if (!ids.has(id) && !p[id].folded) bad('someone still in the hand isn’t at the table');
  });
  const street = h.street;
  if (!Number.isInteger(street) || street < 0 || street > 4) bad('the hand in progress is on an unknown street');
  if (seats.filter(id => !p[id].folded).length < 2) bad('the hand in progress has fewer than two players left');
  const at = (v: any) => (Number.isInteger(v) && seats.includes(v) ? v : null);
  const bbAmt = Number.isInteger(h.bbAmt) && h.bbAmt > 0 ? h.bbAmt : 10;
  const H: Hand = {
    n: Number.isInteger(h.n) && h.n > 0 ? h.n : 1, street, seats: [...seats],
    d: at(h.d) ?? seats[0], sb: at(h.sb) ?? seats[0], bb: at(h.bb) ?? seats[1], bbAmt,
    curBet: Math.max(chips(h.curBet) ? Math.round(h.curBet) : 0, ...seats.map(id => p[id].bet)),
    minRaise: Number.isInteger(h.minRaise) && h.minRaise > 0 ? h.minRaise : bbAmt,
    turn: null, prevButton: Number.isInteger(h.prevButton) ? h.prevButton : null, p,
  };
  if (street === 4) { seats.forEach(id => { p[id].put += p[id].bet; p[id].bet = 0; }); H.curBet = 0; }
  else {
    const t = at(h.turn), q = t != null ? p[t] : null;
    if (!q || q.folded || q.allIn || !ids.has(t)) bad('it isn’t clear whose turn it is');
    H.turn = t;
  }
  return H;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
