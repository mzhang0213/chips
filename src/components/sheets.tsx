import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  allMatched, exportedAt, exportName, exportText, fmt, money, num, P, potTotal, RAISE_RULES, readGame, settle, STREETS,
  type Game, type Player, type Pot, type RaiseKey, type Settings,
} from '../game';
import { cx, Field, H2, inputCls, jsonCls, SBtn, SheetActs, SP } from './ui';

export type SheetState =
  | { kind: 'add' } | { kind: 'fix'; id: number } | { kind: 'rename'; id: number } | { kind: 'hand' }
  | { kind: 'award'; pots: Pot[]; picks: number[][]; autoPicks: number[][] }
  | { kind: 'settings' } | { kind: 'settle' } | { kind: 'export' } | { kind: 'import' }
  | { kind: 'confirm'; title: string; body: string; label: string; fn: () => void };

type Close = { close(): void };

export function AddSheet({ g, onAdd, close }: Close & { g: Game; onAdd(name: string, stack: string): void }) {
  const [name, setName] = useState('');
  const [stack, setStack] = useState(String(g.settings.start));
  const [added, setAdded] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim() || 'Player ' + (g.players.length + 1);
    onAdd(n, stack);
    setName(''); setAdded(`Added ${n}. Add another or tap Done.`); ref.current?.focus();
  };
  return (
    <form onSubmit={submit}>
      <H2>Add players</H2>
      <SP>{g.H ? 'New players are dealt in from the next hand. ' : ''}Add them in seat order, going clockwise around the table.</SP>
      <Field label="Name">
        <input ref={ref} autoFocus className={inputCls} autoComplete="off" enterKeyHint="done" placeholder={`Player ${g.players.length + 1}`} value={name} onChange={e => setName(e.target.value)} />
      </Field>
      <Field label="Starting chips">
        <input className={cx(inputCls, 'num')} inputMode="numeric" value={stack} onChange={e => setStack(e.target.value)} />
      </Field>
      <div className="text-sm text-muted -mt-1.5 mb-3 min-h-[1em]">{added}</div>
      <SheetActs><SBtn onClick={close}>Done</SBtn><SBtn go green type="submit">Add player</SBtn></SheetActs>
    </form>
  );
}

export function FixSheet({ p, onSave, close }: Close & { p: Player; onSave(v: number): void }) {
  const [v, setV] = useState(String(p.stack));
  return (
    <form onSubmit={e => { e.preventDefault(); onSave(Math.max(0, Math.round(num(v)))); }}>
      <H2>Fix {p.name}’s stack</H2>
      <SP>For correcting a mistake. This doesn’t count as a buy-in.</SP>
      <Field label={`Chips ${p.name} has now`}>
        <input autoFocus className={cx(inputCls, 'num')} inputMode="numeric" autoComplete="off" value={v} onChange={e => setV(e.target.value)} />
      </Field>
      <SheetActs><SBtn onClick={close}>Cancel</SBtn><SBtn go green type="submit">Save stack</SBtn></SheetActs>
    </form>
  );
}

export function RenameSheet({ p, onSave, close }: Close & { p: Player; onSave(n: string): void }) {
  const [v, setV] = useState(p.name);
  return (
    <form onSubmit={e => { e.preventDefault(); onSave(v.trim()); }}>
      <H2>Rename</H2>
      <Field label="Name"><input autoFocus className={inputCls} autoComplete="off" value={v} onChange={e => setV(e.target.value)} /></Field>
      <SheetActs><SBtn onClick={close}>Cancel</SBtn><SBtn go green type="submit">Save name</SBtn></SheetActs>
    </form>
  );
}

const optCls = 'text-left py-3 px-3.5 rounded-xl border border-line bg-surface2';
export function HandSheet({ g, onCheckDown, onMisdeal, close }: Close & { g: Game; onCheckDown(): void; onMisdeal(): void }) {
  const H = g.H!;
  const can = H.street < 4 && allMatched(H);
  return <>
    <H2>Hand {H.n}</H2>
    <SP>{STREETS[H.street]}, with {fmt(potTotal(g))} in the pot.</SP>
    <div className="flex flex-col gap-2 mb-3">
      <button type="button" className={optCls} disabled={!can} onClick={onCheckDown}>
        <b className="block">Skip to showdown</b>
        <span className="block text-sm text-muted mt-0.5">{can ? 'Everyone still in checks the rest of the way.' : 'Not while someone still has a bet to call.'}</span>
      </button>
      <button type="button" className={optCls} onClick={onMisdeal}>
        <b className="block">Misdeal</b>
        <span className="block text-sm text-muted mt-0.5">Everyone gets back what they put in, and the same dealer deals again.</span>
      </button>
    </div>
    <SheetActs><SBtn onClick={close}>Close</SBtn></SheetActs>
  </>;
}

// Pick winners. Pots only one player can win are handed out automatically.
export function AwardSheet({ g, s, onPick, onAward, close }: Close & { g: Game; s: Extract<SheetState, { kind: 'award' }>; onPick(k: number, id: number): void; onAward(): void }) {
  const { pots, picks } = s;
  const contested = pots.map((pt, k) => ({ pt, k })).filter(o => o.pt.eligible.length > 1);
  const many = contested.length > 1;
  const ready = contested.every(o => picks[o.k].length);
  let label = 'Award pots';
  if (!many) { const sel = contested[0] ? picks[contested[0].k] : []; label = sel.length > 1 ? `Split ${sel.length} ways` : sel.length ? `Give pot to ${P(g, sel[0]).name}` : 'Award pot'; }
  return <>
    <H2>{g.H ? 'Showdown' : 'Award the pot'}</H2>
    <SP>{many ? 'Pick who won each pot.' : `Pick who won ${fmt(contested[0]?.pt.amount ?? 0)}.`} Pick more than one player to split it. Odd chips go to the first one picked.</SP>
    {contested.map((o, i) => (
      <div key={o.k}>
        {many && (
          <div className="flex justify-between items-baseline font-bold mt-1 mx-0.5 mb-1.5">
            <span>{i ? (contested.length > 2 ? `Side pot ${i}` : 'Side pot') : 'Main pot'}</span>
            <span className="num text-xl">{fmt(o.pt.amount)}</span>
          </div>
        )}
        <div className="flex flex-col gap-1.5 mb-3.5">
          {o.pt.eligible.map(id => (
            <button
              key={id} type="button" aria-pressed={picks[o.k].includes(id)} onClick={() => onPick(o.k, id)}
              className="flex justify-between py-3 px-3.5 rounded-xl border border-line bg-surface2 font-semibold aria-pressed:border-win aria-pressed:shadow-[0_0_0_2px_var(--win)]"
            ><span>{P(g, id).name}</span></button>
          ))}
        </div>
      </div>
    ))}
    {pots.filter(pt => pt.eligible.length === 1).map((pt, i) => {
      const n = P(g, pt.eligible[0]).name;
      return <SP key={i}>{pt.solo ? `${n} gets back ${fmt(pt.amount)} that nobody called.` : `${n} wins a side pot of ${fmt(pt.amount)}, since everyone else in it folded.`}</SP>;
    })}
    <SheetActs><SBtn onClick={close}>Not yet</SBtn><SBtn go green disabled={!ready} onClick={onAward}>{label}</SBtn></SheetActs>
  </>;
}

export function SettingsSheet({ g, onSave, onExport, onImport, onNewGame, onWipe, close }: Close & {
  g: Game; onSave(s: Settings): void; onExport(): void; onImport(): void; onNewGame(): void; onWipe(): void;
}) {
  const s = g.settings;
  const [f, setF] = useState({ sb: String(s.sb), bb: String(s.bb), raise: s.raise as string, start: String(s.start), value: String(s.value), den: s.denoms.join(', ') });
  const bind = (k: keyof typeof f) => ({ value: f[k], onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value }) });
  const save = () => {
    const start = Math.max(1, Math.round(num(f.start) || 1000));
    const value = Math.max(0, num(f.value));
    let denoms = f.den.split(/[,\s]+/).map(Number).filter(x => x > 0).map(Math.round).slice(0, 6);
    if (!denoms.length) denoms = [5, 25, 100, 500];
    const bb = Math.max(1, Math.round(num(f.bb) || 10));
    const sb = Math.min(bb, Math.round(num(f.sb)));
    const raise = (f.raise in RAISE_RULES ? f.raise : 'x2') as RaiseKey;
    onSave({ start, value, denoms, sb, bb, raise });
  };
  return <>
    <H2>Settings</H2>
    <div className="grid grid-cols-2 gap-2.5">
      <Field label="Small blind"><input className={cx(inputCls, 'num')} inputMode="numeric" {...bind('sb')} /></Field>
      <Field label="Big blind"><input className={cx(inputCls, 'num')} inputMode="numeric" {...bind('bb')} /></Field>
    </div>
    {g.H && <SP>New blinds start with the next hand.</SP>}
    <Field label="Raise button goes to" small="When nobody has bet yet, double and triple use the big blind instead.">
      <select className={inputCls} {...bind('raise')}>
        {Object.entries(RAISE_RULES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
      </select>
    </Field>
    <Field label="Starting stack and rebuy amount (chips)"><input className={cx(inputCls, 'num')} inputMode="numeric" {...bind('start')} /></Field>
    <Field label="Dollar value of one chip"><input className={inputCls} inputMode="decimal" {...bind('value')} /></Field>
    <Field label="Chip buttons, separated by commas"><input className={inputCls} inputMode="text" {...bind('den')} /></Field>
    <SheetActs><SBtn onClick={close}>Cancel</SBtn><SBtn go green onClick={save}>Save settings</SBtn></SheetActs>
    <SheetActs className="mt-[18px]"><SBtn onClick={onExport}>Export game</SBtn><SBtn onClick={onImport}>Load game</SBtn></SheetActs>
    <SheetActs><SBtn onClick={onNewGame}>New game, same players</SBtn><SBtn className="text-red-ink" onClick={onWipe}>Clear everything</SBtn></SheetActs>
  </>;
}

const warnCls = 'bg-surface2 border-l-4 border-brass py-2.5 px-3 rounded-lg mb-3.5 text-sm';
export function SettleSheet({ g, close }: Close & { g: Game }) {
  const { v, rows, warn, pays } = settle(g);
  const td = 'text-right py-2 px-1 border-t border-line';
  return <>
    <H2>Settle up</H2>
    {warn && <div className={warnCls}>{warn}</div>}
    <table className="w-full border-collapse text-[15px] mb-4">
      <thead><tr className="[&>th]:text-right [&>th]:font-medium [&>th]:text-muted [&>th]:text-[13px] [&>th]:p-1">
        <th className="text-left!">Player</th><th>Bought in</th><th>Chips</th><th>Net</th>
      </tr></thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.p.id}>
            <td className={cx(td, 'text-left!')}>{r.p.name}</td>
            <td className={cx(td, 'num')}>{fmt(r.p.buyIn)}</td>
            <td className={cx(td, 'num')}>{fmt(r.p.stack)}</td>
            <td className={cx(td, r.net > 0 && 'text-win-ink font-bold', r.net < 0 && 'text-red-ink font-bold')}>{money(r.net * v)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    {pays.length
      ? <ul className="list-none p-0 m-0 mb-4">{pays.map((x, i) => <li key={i} className="py-2.5 px-3 bg-surface2 rounded-[10px] mb-1.5">{x.from} pays {x.to} <b>{money(x.amount)}</b></li>)}</ul>
      : <SP>No one owes anything yet.</SP>}
    <SP>Each chip is worth {money(v)}. Change it in settings.</SP>
    <SheetActs><SBtn onClick={close}>Close</SBtn></SheetActs>
  </>;
}

const msgCls = (k: '' | 'ok' | 'err') => cx('text-sm m-0 mb-3 min-h-[1.4em]', k === 'ok' && 'text-win-ink', k === 'err' && 'text-red-ink');

export function ExportSheet({ g, close }: Close & { g: Game }) {
  const [{ name, text }] = useState(() => ({ name: exportName(), text: exportText(g) }));
  const [msg, setMsg] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  const saveFile = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    setMsg(`Downloading ${name}.`);
  };
  const copy = async () => {
    let done = false;
    try { await navigator.clipboard.writeText(text); done = true; } catch { /* fall back below */ }
    if (!done && ta.current) { ta.current.focus(); ta.current.setSelectionRange(0, text.length); try { done = document.execCommand('copy'); } catch { /* manual copy */ } }
    setMsg(done ? 'Copied. Paste it into a note or a message to keep it.'
      : 'Couldn’t copy automatically. The text is selected, so copy it with your device’s copy command.');
  };
  return <>
    <H2>Export game</H2>
    <SP>The file holds players, stacks, buy-ins, settings, history and any hand in progress. Open it again with Load game in settings, on this device or another.</SP>
    <textarea ref={ta} className={jsonCls} readOnly spellCheck={false} aria-label="Exported game" value={text} />
    <p className={msgCls('')} aria-live="polite">{msg}</p>
    <SheetActs><SBtn onClick={close}>Done</SBtn><SBtn onClick={copy}>Copy</SBtn><SBtn go green onClick={saveFile}>Save file</SBtn></SheetActs>
  </>;
}

export function ImportSheet({ onLoad, close }: Close & { onLoad(g: Game, msg: string): void }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileErr, setFileErr] = useState('');
  const [loadErr, setLoadErr] = useState('');

  // Validate as the text changes.
  let status: { k: '' | 'ok' | 'err'; m: string } = { k: '', m: '' };
  let parsed: ReturnType<typeof readGame> | null = null;
  if (fileErr) status = { k: 'err', m: fileErr };
  else if (loadErr) status = { k: 'err', m: loadErr };
  else if (text.trim()) {
    try {
      parsed = readGame(text);
      const gm = parsed.game, n = gm.players.filter(p => !p.out).length, when = exportedAt(parsed.meta);
      status = { k: 'ok', m: `Ready to load: ${n} player${n === 1 ? '' : 's'} at the table, ${gm.H ? `hand ${gm.H.n} in progress` : `hand ${gm.hand} up next`}${when ? `, exported ${when}` : ''}.` };
    } catch (err) { status = { k: 'err', m: (err as Error).message }; }
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setFileName(f.name); setLoadErr('');
    if (f.size > 5e6) { setFileErr('That file is too big to be an exported game.'); return; }
    try { setText(await f.text()); setFileErr(''); }
    catch { setFileErr('That file couldn’t be read.'); }
  };
  const go = () => {
    if (!parsed) return;
    try { const when = exportedAt(parsed.meta); onLoad(parsed.game, when ? `Loaded a game exported ${when}` : 'Loaded a saved game'); }
    catch (err) { setLoadErr((err as Error).message); }
  };

  return <>
    <H2>Load game</H2>
    <SP>This replaces the current game with one you exported. You can undo it right after.</SP>
    <label className="relative block text-center p-3.5 rounded-xl border border-line bg-surface2 font-bold cursor-pointer mb-3.5 focus-within:outline-3 focus-within:outline-brass focus-within:outline-offset-2">
      <input type="file" accept=".json,application/json,text/plain" onChange={onFile} className="absolute inset-0 w-full opacity-0 cursor-pointer" />
      <span>{fileName || 'Choose a file'}</span>
    </label>
    <Field label="Or paste the exported text">
      <textarea className={jsonCls} spellCheck={false} autoComplete="off" placeholder="Paste here" value={text}
        onChange={e => { setText(e.target.value); setFileErr(''); setLoadErr(''); }} />
    </Field>
    <p className={msgCls(status.k)} aria-live="polite">{status.m}</p>
    <SheetActs><SBtn onClick={close}>Cancel</SBtn><SBtn go green disabled={status.k !== 'ok'} onClick={go}>Load game</SBtn></SheetActs>
  </>;
}

export function ConfirmSheet({ s, onConfirm, close }: Close & { s: Extract<SheetState, { kind: 'confirm' }>; onConfirm(): void }) {
  return <>
    <H2>{s.title}</H2>
    <SP>{s.body}</SP>
    <SheetActs><SBtn onClick={close}>Cancel</SBtn><SBtn go onClick={onConfirm}>{s.label}</SBtn></SheetActs>
  </>;
}
