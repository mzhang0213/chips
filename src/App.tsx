'use client';

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  actMut, addPlayerMut, allMatched, awardablePots, awardMut, checkDownMut, dealMut, fmt, fresh, isLive, misdealMut,
  num, P, positions, potTotal, rinfo, sideText, STREETS,
  type ActKind, type Pot, type RaiseKey,
} from './game';
import { useGame } from './useGame';
import { PlayerRow, type RowApi } from './components/PlayerRow';
import {
  AddSheet, AwardSheet, ConfirmSheet, ExportSheet, FixSheet, HandSheet, ImportSheet, RenameSheet, SettingsSheet, SettleSheet,
  type SheetState,
} from './components/sheets';
import { cx, Sheet } from './components/ui';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const toTop = () => scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' });

function useSheet() {
  const [state, setState] = useState<SheetState | null>(null);
  const [on, setOn] = useState(false);
  const [nonce, setNonce] = useState(0);   // remounts the sheet body so its form state starts fresh
  const t = useRef<number | undefined>(undefined);
  const open = useCallback((s: SheetState) => {
    clearTimeout(t.current); // a sheet that's still closing must not wipe this one
    setState(s); setNonce(n => n + 1);
    requestAnimationFrame(() => requestAnimationFrame(() => setOn(true))); // render closed first so the slide-in runs
  }, []);
  const close = useCallback(() => {
    clearTimeout(t.current); setOn(false);
    t.current = window.setTimeout(() => setState(null), 200);
  }, []);
  return { state, setState, on, nonce, open, close };
}

export default function App() {
  const { game: g, get, commit, undo, canUndo, replace } = useGame();
  const [sel, setSel] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [ramt, setRamt] = useState(0);          // the raise being built by the player to act (0 = use the raise button's rule)
  const [rkey, setRkey] = useState<RaiseKey | null>(null);
  const sheet = useSheet();
  const potRef = useRef<HTMLDivElement>(null);

  // Work that has to wait for the next render (scrolling to the new turn, opening the showdown).
  const after = useRef<(() => void) | null>(null);
  useEffect(() => { const f = after.current; after.current = null; f?.(); }, [g]);

  const bumpPot = () => {
    const c = potRef.current; if (!c) return;
    c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  };
  const resetTurn = () => { setRamt(0); setRkey(null); setMoreOpen(false); setSel(null); };

  function afterAction(bump: boolean, kb: boolean) {
    const g = get();
    if (bump || !g.H) bumpPot();
    if (g.H && g.H.street === 4) return openAward();
    if (!g.H) return toTop();
    const el = document.querySelector('[data-turn]');
    el?.scrollIntoView({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' });
    if (kb) document.querySelector<HTMLElement>('[data-turn] [data-panel] button')?.focus({ preventScroll: true });
  }

  function deal(kb: boolean) {
    const g = get();
    if (!positions(g) || g.H || g.pot) return;
    resetTurn();
    commit('', dealMut);
    after.current = () => afterAction(true, kb);
  }

  function act(id: number, kind: ActKind, kb: boolean) {
    const g = get(), H = g.H; if (!H || H.street > 3 || H.turn !== id) return;
    const p = P(g, id), x = H.p[id]; if (!p || !x) return;
    if (kind === 'check' && H.curBet - x.bet > 0) return;
    if (kind === 'allin' && !p.stack) return;
    let target = 0;
    if (kind === 'raise') { const r = rinfo(g, p, ramt); if (!r.can || !r.ok) return; target = r.target; }
    resetTurn();
    commit('', d => actMut(d, id, kind, target));
    after.current = () => afterAction(kind !== 'fold' && kind !== 'check', kb);
  }

  function checkDown() {
    const H = get().H; if (!H || H.street > 3 || !allMatched(H)) return;
    setRamt(0); setRkey(null); setSel(null);
    commit('Everyone checks to the showdown', checkDownMut);
    after.current = openAward;
  }

  function misdeal() {
    if (!get().H) return;
    setRamt(0); setRkey(null); setSel(null);
    commit('', misdealMut);
    sheet.close(); bumpPot(); toTop();
  }

  function openAward() {
    const pots = awardablePots(get()); if (!pots) return;
    const picks = pots.map(pt => (pt.eligible.length === 1 ? [...pt.eligible] : []));
    if (!pots.some(pt => pt.eligible.length > 1)) return doAward(pots, picks);
    sheet.open({ kind: 'award', pots, picks, autoPicks: pots.map(() => []) });
  }

  function doAward(pots: Pot[], picks: number[][]) {
    if (pots.some((_, k) => !picks[k].length)) return;
    commit('', d => awardMut(d, pots, picks));
    sheet.close(); bumpPot(); toTop();
  }

  function pick(k: number, id: number) {
    const s = sheet.state; if (s?.kind !== 'award') return;
    const picks = s.picks.map(a => [...a]);
    const autos = s.autoPicks.map((a, j) => (j === k ? a.filter(x => x !== id) : [...a]));   // tapping a pot makes that choice yours
    if (picks[k].includes(id)) {
      picks[k] = picks[k].filter(x => x !== id);
      // take back the side pots we filled in for them
      picks.forEach((_, j) => { if (j > k && autos[j].includes(id)) { picks[j] = picks[j].filter(x => x !== id); autos[j] = autos[j].filter(x => x !== id); } });
    } else {
      picks[k].push(id);
      // whoever wins a pot usually wins the side pots they're in too
      picks.forEach((sj, j) => { if (j > k && !sj.length && s.pots[j].eligible.length > 1 && s.pots[j].eligible.includes(id)) { sj.push(id); autos[j].push(id); } });
    }
    sheet.setState({ ...s, picks, autoPicks: autos });
  }

  function confirm(title: string, body: string, label: string, fn: () => void) {
    sheet.open({ kind: 'confirm', title, body, label, fn });
  }

  const api: RowApi = {
    toggle: id => setSel(sel === id ? null : id),
    act,
    setSize: (k, v) => { setRamt(v); setRkey(k); },
    addAmt: v => { setRamt(ramt + v); setRkey(null); },
    clearAmt: () => { setRamt(0); setRkey(null); },
    typeAmt: s => { setRamt(parseInt(s.replace(/\D/g, ''), 10) || 0); setRkey(null); },
    rebuy: id => { const p = P(get(), id), a = get().settings.start; commit(`${p.name} rebought for ${fmt(a)}`, d => { const q = P(d, id); q.stack += a; q.buyIn += a; }); },
    fix: id => sheet.open({ kind: 'fix', id }),
    rename: id => sheet.open({ kind: 'rename', id }),
    dealer: id => { if (!get().H) commit(`${P(get(), id).name} will deal the next hand`, d => { d.btnNext = id; }); },
    seat: (id, dir) => {
      const g = get(); if (g.H) return;
      const list = g.players, i = list.findIndex(p => p.id === id);
      let j = i + dir; while (j >= 0 && j < list.length && list[j].out) j += dir;
      if (j < 0 || j >= list.length) return;
      commit('', d => { [d.players[i], d.players[j]] = [d.players[j], d.players[i]]; });
    },
    cashout: id => {
      const g = get(); if (isLive(g, id)) return;
      commit(`${P(g, id).name} cashed out with ${fmt(P(g, id).stack)}`, d => { P(d, id).out = true; if (d.btnNext === id) d.btnNext = null; });
      setSel(null);
    },
    backin: id => commit(`${P(get(), id).name} is back in`, d => { P(d, id).out = false; }),
    remove: id => {
      const g = get(); if (isLive(g, id)) return;
      const p = P(g, id);
      confirm(`Remove ${p.name}?`, `Their ${fmt(p.stack)} chips leave the table and they won’t show up in settle up. To keep their result, use Cash out instead.`, 'Remove player', () => {
        commit(`${p.name} was removed`, d => { d.players = d.players.filter(x => x.id !== id); if (d.btnNext === id) d.btnNext = null; });
        setSel(null);
      });
    },
  };

  function doUndo() {
    if (!undo()) return;
    setRamt(0); setRkey(null);
    if (sel != null && !get().players.some(p => p.id === sel)) setSel(null);
    bumpPot();
  }

  /* ---------- render ---------- */
  const H = g.H, active = g.players.filter(p => !p.out), out = g.players.filter(p => p.out);
  const pos: { d?: number; sb?: number; bb?: number } = H ? { d: H.d, sb: H.sb, bb: H.bb } : (positions(g) || {});

  let status = '', btn: ReactNode = null;
  const ctaCls = 'py-3 px-7 text-[17px] font-bold rounded-full text-onaccent shadow-[0_3px_0_rgba(0,0,0,.22)] active:translate-y-0.5 active:shadow-[0_1px_0_rgba(0,0,0,.22)]';
  if (H) {
    if (H.street === 4) {
      status = 'Showdown.' + sideText(g);
      btn = <button type="button" className={cx(ctaCls, 'bg-win border border-win')} onClick={openAward}>Pick the winner</button>;
    } else {
      const t = H.turn != null ? P(g, H.turn) : null;
      status = (t ? `${t.name} to act.` : '') + sideText(g);
      btn = <button type="button" className="font-semibold py-2 px-4 rounded-full border border-line bg-surface" onClick={() => sheet.open({ kind: 'hand' })}>Hand options</button>;
    }
  } else if (g.pot) {
    status = 'These chips are left over from before. Award them to start dealing.';
    btn = <button type="button" className={cx(ctaCls, 'bg-win border border-win')} onClick={openAward}>Award the pot</button>;
  } else if (g.players.length) {
    status = (g.last ? g.last + ' ' : '') + (pos.d ? `${P(g, pos.d).name} deals next.` : 'You need two players with chips to deal.');
    btn = <button type="button" className={cx(ctaCls, 'bg-red border border-red')} disabled={!pos.d} onClick={e => deal(e.detail === 0)}>Deal hand {g.hand}</button>;
  }

  const rowProps = { g, sel, ramt, rkey, moreOpen, setMoreOpen, api };
  const tbtn = 'flex-none whitespace-nowrap py-2 px-3 rounded-full bg-surface border border-line font-semibold text-[15px]';
  const lbl = 'text-sm font-semibold text-[#7A5A1A] -mb-1';

  return (
    <>
      <div className="max-w-[520px] mx-auto px-4">
        <header className="flex items-center gap-2 pt-3.5 pb-1.5">
          <h1 className="font-display font-extrabold text-[28px] m-0 flex-1 tracking-[.02em]">Chip tracker</h1>
          <button type="button" className={tbtn} disabled={!canUndo} aria-label="Undo last action" onClick={doUndo}>Undo</button>
          <button type="button" className={tbtn} onClick={() => sheet.open({ kind: 'settle' })}>Settle up</button>
          <button type="button" className={tbtn} aria-label="Settings" onClick={() => sheet.open({ kind: 'settings' })}>⚙︎</button>
        </header>

        <section className="flex flex-col items-center pt-3.5 pb-2 text-center" aria-live="polite">
          <div ref={potRef} className="potchip w-[200px] h-[200px] rounded-full relative grid place-items-center">
            <div className="w-[150px] h-[150px] rounded-full bg-pot-inner text-pot-ink border-2 border-dashed border-red flex flex-col items-center justify-center">
              <span className={lbl}>Hand {H ? H.n : g.hand}</span>
              <span className="num text-[52px] font-extrabold leading-none">{fmt(potTotal(g))}</span>
              <span className={lbl}>{H ? STREETS[H.street] : `Blinds ${fmt(g.settings.sb)}/${fmt(g.settings.bb)}`}</span>
            </div>
          </div>
          {status && <p className="mt-3.5 mb-0 text-muted text-[15px] max-w-[34ch]">{status}</p>}
          <div className="mt-2.5">{btn}</div>
        </section>

        <ul className="list-none mt-2.5 p-0 flex flex-col gap-2">
          {g.players.length
            ? active.map(p => <PlayerRow key={p.id} {...rowProps} p={p} pos={pos} />)
            : <li className="text-center text-muted pt-[18px] px-2.5 pb-1">Add everyone in seat order, going clockwise around the table. Each player starts with {fmt(g.settings.start)} chips, which you can change in settings.</li>}
        </ul>
        <button type="button" className="w-full mt-2.5 p-3.5 rounded-[14px] border-2 border-dashed border-line font-bold text-muted" onClick={() => sheet.open({ kind: 'add' })}>+ Add player</button>
        {out.length > 0 && <>
          <div className="text-sm text-muted mt-[18px] mx-0.5 mb-1.5">Cashed out</div>
          <ul className="list-none m-0 p-0 flex flex-col gap-2">
            {out.map(p => <PlayerRow key={p.id} {...rowProps} p={p} pos={{}} />)}
          </ul>
        </>}

        <details className="mt-[22px]">
          <summary className="font-bold py-1.5 px-0.5 cursor-pointer">History</summary>
          <ol className="list-none m-0 p-0 text-sm">
            {g.log.length
              ? g.log.slice(0, 80).map((l, i) => (
                <li key={i} className="flex gap-2.5 py-[7px] px-0.5 border-b border-line"><span className="text-muted w-14 flex-none">Hand {l.hand}</span><span>{l.msg}</span></li>))
              : <li className="flex gap-2.5 py-[7px] px-0.5 border-b border-line"><span>Nothing yet.</span></li>}
          </ol>
        </details>
      </div>

      {sheet.state && (
        <Sheet on={sheet.on} onClose={sheet.close}>
          <Fragment key={sheet.nonce}>{renderSheet()}</Fragment>
        </Sheet>
      )}
    </>
  );

  function renderSheet() {
    const s = sheet.state!, close = sheet.close;
    switch (s.kind) {
      case 'add': return <AddSheet g={g} close={close} onAdd={(name, stack) => {
        const st = Math.max(0, Math.round(num(stack)));
        commit(`${name} joined with ${fmt(st)}`, d => addPlayerMut(d, name, st));
      }} />;
      case 'fix': {
        const p = P(g, s.id);
        return <FixSheet p={p} close={close} onSave={v => {
          if (v !== p.stack) commit(`${p.name}’s stack changed from ${fmt(p.stack)} to ${fmt(v)}`, d => { P(d, p.id).stack = v; });
          close();
        }} />;
      }
      case 'rename': {
        const p = P(g, s.id);
        return <RenameSheet p={p} close={close} onSave={n => {
          if (n && n !== p.name) commit(`${p.name} is now ${n}`, d => { P(d, p.id).name = n; });
          close();
        }} />;
      }
      case 'hand': return g.H ? <HandSheet g={g} close={close} onCheckDown={checkDown} onMisdeal={misdeal} /> : null;
      case 'award': return <AwardSheet g={g} s={s} close={close} onPick={pick} onAward={() => doAward(s.pots, s.picks)} />;
      case 'settings': return <SettingsSheet g={g} close={close}
        onSave={st => {
          const old = g.settings;
          commit(st.sb !== old.sb || st.bb !== old.bb ? `Blinds are now ${fmt(st.sb)}/${fmt(st.bb)}` : '', d => { d.settings = st; });
          close();
        }}
        onExport={() => sheet.open({ kind: 'export' })}
        onImport={() => sheet.open({ kind: 'import' })}
        onNewGame={() => confirm('Start a new game?', `Everyone keeps their seat and goes back to ${fmt(g.settings.start)} chips. The pot, buy-ins and history reset.`, 'Start new game', () => {
          commit('', d => {
            d.players.forEach(p => { p.stack = d.settings.start; p.buyIn = d.settings.start; p.out = false; });
            d.pot = 0; d.hand = 1; d.log = []; d.H = null; d.button = null; d.btnNext = null; d.last = '';
          });
          setSel(null);
        })}
        onWipe={() => confirm('Clear everything?', 'All players, stacks and history are deleted. You can undo this right after.', 'Clear everything', () => {
          commit('', d => { const st = d.settings; Object.assign(d, fresh()); d.settings = st; });
          setSel(null);
        })} />;
      case 'settle': return <SettleSheet g={g} close={close} />;
      case 'export': return <ExportSheet g={g} close={close} />;
      case 'import': return <ImportSheet close={close} onLoad={(next, msg) => {
        setSel(null); setRamt(0); setRkey(null); setMoreOpen(false);
        replace(next, msg);
        close(); toTop();
      }} />;
      case 'confirm': return <ConfirmSheet s={s} close={close} onConfirm={() => { close(); s.fn(); }} />;
    }
  }
}
