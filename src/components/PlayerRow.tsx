import type { CSSProperties, MouseEvent } from 'react';
import {
  CHIPC, dealable, fmt, isLive, positions, raiseLabel, rinfo, short,
  type ActKind, type Game, type Player, type RaiseKey, type Seat,
} from '../game';
import { ActBtn, Acts, cx, Hint } from './ui';

export interface RowApi {
  toggle(id: number): void;
  act(id: number, kind: ActKind, kb: boolean): void;
  setSize(k: RaiseKey, v: number): void;
  addAmt(v: number): void;
  clearAmt(): void;
  typeAmt(s: string): void;
  rebuy(id: number): void;
  fix(id: number): void;
  rename(id: number): void;
  dealer(id: number): void;
  seat(id: number, dir: 1 | -1): void;
  cashout(id: number): void;
  backin(id: number): void;
  remove(id: number): void;
}
type Pos = { d?: number; sb?: number; bb?: number };
type Props = { g: Game; p: Player; pos: Pos; sel: number | null; ramt: number; rkey: RaiseKey | null; moreOpen: boolean; setMoreOpen(v: boolean): void; api: RowApi };

const kbOf = (e: MouseEvent) => e.detail === 0;

function statusOf(g: Game, p: Player, x: Seat | undefined, turn: boolean): [string, string] {
  const n = p.stack - p.buyIn;
  const net: [string, string] = n > 0 ? ['up', `Up ${fmt(n)}`] : n < 0 ? ['down', `Down ${fmt(-n)}`] : ['', 'Even'];
  if (p.out) return [net[0], `Left with ${fmt(p.stack)}, ${net[1].toLowerCase()}`];
  const H = g.H;
  if (H && x) {
    if (turn) { const c = Math.min(Math.max(0, H.curBet - x.bet), p.stack); return ['turn', c ? `To act, ${fmt(c)} to call` : 'To act']; }
    if (x.folded) return ['', 'Folded'];
    if (x.allIn) return ['', 'All in'];
    if (x.last) return ['', x.last];
    return x.put + x.bet ? ['', `In for ${fmt(x.put + x.bet)}`] : ['', 'Waiting'];
  }
  if (!p.stack) return ['down', 'Out of chips, rebuy to play'];
  if (H) return ['', 'Joins next hand'];
  return net;
}
const subCls: Record<string, string> = { up: 'text-win-ink', down: 'text-red-ink', turn: 'text-brass-ink font-bold' };
const tagCls = 'flex-none text-[11px] font-extrabold leading-none py-[3px] px-1.5 rounded-full border border-line text-muted';

export function PlayerRow(props: Props) {
  const { g, p, pos, sel, api } = props;
  const H = g.H, x = H?.p[p.id], turn = !!(H && H.street < 4 && H.turn === p.id), open = turn || sel === p.id;
  const [cls, txt] = statusOf(g, p, x, turn);
  const inner = <>
    <span className="av w-[38px] h-[38px] rounded-full flex-none grid place-items-center text-white font-bold" style={{ '--c': p.color } as CSSProperties}>
      {p.name.charAt(0).toUpperCase()}
    </span>
    <span className="flex-1 min-w-0">
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="font-bold whitespace-nowrap overflow-hidden text-ellipsis min-w-0">{p.name}</span>
        {pos.d === p.id && <span className="dealer flex-none w-5 h-5 rounded-full grid place-items-center text-[11px] font-extrabold leading-none" title="Dealer">D</span>}
        {pos.sb === p.id && <span className={tagCls} title="Small blind">SB</span>}
        {pos.bb === p.id && <span className={tagCls} title="Big blind">BB</span>}
      </span>
      <span className={cx('block text-[13px] text-muted', subCls[cls])}>{txt}</span>
    </span>
    <span className="num text-[32px] font-extrabold leading-none">{fmt(p.stack)}</span>
  </>;
  const rowCls = 'w-full flex items-center gap-3 py-3 px-3.5 text-left';
  return (
    <li
      data-turn={turn || undefined}
      className={cx('bg-surface rounded-[14px] border overflow-hidden',
        turn ? 'border-brass shadow-[0_0_0_2px_var(--brass)]' : open ? 'border-muted' : 'border-line',
        (x?.folded || p.out) && 'opacity-60')}
    >
      {turn
        ? <div className={rowCls}>{inner}</div>
        : <button type="button" className={rowCls} aria-expanded={open} onClick={() => api.toggle(p.id)}>{inner}</button>}
      {turn ? <TurnPanel {...props} /> : sel === p.id ? <ManagePanel g={g} p={p} api={api} /> : null}
    </li>
  );
}

const panelCls = 'px-3.5 pt-1 pb-3.5 border-t border-line bg-surface2';

// The quick actions for whoever's turn it is.
function TurnPanel({ g, p, ramt, rkey, moreOpen, setMoreOpen, api }: Props) {
  const H = g.H!, x = H.p[p.id], toCall = Math.max(0, H.curBet - x.bet), call = Math.min(toCall, p.stack);
  const r = rinfo(g, p, ramt);
  const callTxt = !toCall ? 'Check' : call === p.stack ? `Call ${fmt(call)}, all in` : `Call ${fmt(call)}`;
  let hint = '';
  if (r.can) {
    const what = r.opening ? 'bet' : 'raise', to = r.opening ? '' : 'to ';
    hint = r.short ? `${p.name} doesn’t have enough for a full ${what}, so it’s all in or nothing.`
      : ramt && !r.ok ? `The smallest ${what} is ${to}${fmt(r.min)}.`
      : `Smallest ${what} is ${to}${fmt(r.min)}. The pot is ${fmt(r.pot)}.`;
  }
  return (
    <div data-panel className={panelCls}>
      <Acts className="mt-3">
        <ActBtn onClick={e => api.act(p.id, 'fold', kbOf(e))}>Fold</ActBtn>
        <ActBtn tone="call" onClick={e => api.act(p.id, toCall ? 'call' : 'check', kbOf(e))}>{callTxt}</ActBtn>
        {r.can && <>
          <ActBtn tone="primary" disabled={!r.ok} onClick={e => api.act(p.id, 'raise', kbOf(e))}>{raiseLabel(r, p)}</ActBtn>
          <ActBtn tone="danger" onClick={e => api.act(p.id, 'allin', kbOf(e))}>All in {fmt(p.stack)}</ActBtn>
        </>}
      </Acts>
      {r.can && <>
        <div className="flex gap-1.5 mt-3" role="group" aria-label={`${r.opening ? 'Bet' : 'Raise'} size`}>
          {r.sizes.map(s => (
            <button
              key={s.k} type="button" title={s.tip} aria-label={`${s.tip}, ${fmt(s.v)}`}
              aria-pressed={rkey ? s.k === rkey : !ramt && s.k === g.settings.raise}
              onClick={() => api.setSize(s.k, s.v)}
              className="flex-1 basis-0 min-w-0 py-[9px] px-0.5 rounded-full border border-line bg-surface font-bold text-sm whitespace-nowrap aria-pressed:bg-ink aria-pressed:border-ink aria-pressed:text-surface"
            >{s.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2.5 mt-3 mb-2.5">
          <label htmlFor="amt" className="text-sm text-muted whitespace-nowrap">{r.opening ? 'Bet' : 'Raise to'}</label>
          <input
            id="amt" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
            value={ramt || ''} placeholder={fmt(r.def)}
            onChange={e => api.typeAmt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className="num flex-1 min-w-0 text-[34px] font-extrabold bg-surface border border-line rounded-[10px] px-3 py-0.5 h-[50px]"
          />
          <button type="button" className="py-2.5 px-3 rounded-[10px] font-semibold text-muted" onClick={api.clearAmt}>Clear</button>
        </div>
        <div className="flex justify-between items-center gap-1.5 mb-1">
          {g.settings.denoms.map((v, i) => (
            <button
              key={i} type="button" aria-label={`Add ${v}`} onClick={() => api.addAmt(v)}
              className="chip flex-[0_1_58px] min-w-0 aspect-square p-0 rounded-full text-white font-extrabold text-[15px]"
              style={{ '--c': CHIPC[i % CHIPC.length] } as CSSProperties}
            >{short(v)}</button>
          ))}
        </div>
        <Hint>{hint}</Hint>
      </>}
      <details className="mt-3" open={moreOpen} onToggle={e => setMoreOpen(e.currentTarget.open)}>
        <summary className="text-muted text-sm pt-1 pb-2 cursor-pointer">Fix a stack or edit player</summary>
        <ManageButtons g={g} p={p} api={api} />
      </details>
    </div>
  );
}

function ManageButtons({ g, p, api, className }: { g: Game; p: Player; api: RowApi; className?: string }) {
  const H = g.H, live = isLive(g, p.id);
  const act = g.players.filter(q => !q.out), i = act.indexOf(p);
  const next = !H && positions(g), isNextD = !!next && next.d === p.id;
  return <>
    <Acts className={className}>
      <ActBtn onClick={() => api.rebuy(p.id)}>Rebuy {fmt(g.settings.start)}</ActBtn>
      <ActBtn onClick={() => api.fix(p.id)}>Fix stack</ActBtn>
      <ActBtn onClick={() => api.rename(p.id)}>Rename</ActBtn>
      {!H && <>
        <ActBtn disabled={isNextD || !dealable(g).includes(p.id)} onClick={() => api.dealer(p.id)}>{isNextD ? 'Deals next hand' : 'Make dealer'}</ActBtn>
        <ActBtn disabled={i <= 0} onClick={() => api.seat(p.id, -1)}>Move up a seat</ActBtn>
        <ActBtn disabled={i >= act.length - 1} onClick={() => api.seat(p.id, 1)}>Move down a seat</ActBtn>
      </>}
      <ActBtn disabled={live} onClick={() => api.cashout(p.id)}>Cash out</ActBtn>
      <ActBtn tone="danger" disabled={live} onClick={() => api.remove(p.id)}>Remove</ActBtn>
    </Acts>
    {live && <Hint>You can cash out or remove {p.name} once they fold or the hand ends.</Hint>}
  </>;
}

function ManagePanel({ g, p, api }: { g: Game; p: Player; api: RowApi }) {
  if (p.out) return (
    <div className={panelCls}>
      <Acts className="mt-3">
        <ActBtn onClick={() => api.backin(p.id)}>Back in the game</ActBtn>
        <ActBtn tone="danger" onClick={() => api.remove(p.id)}>Remove</ActBtn>
      </Acts>
    </div>
  );
  return <div className={panelCls}><ManageButtons g={g} p={p} api={api} className="mt-3" /></div>;
}
