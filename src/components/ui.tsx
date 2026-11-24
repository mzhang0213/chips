import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- player panel buttons ---------- */
type Tone = 'plain' | 'primary' | 'call' | 'danger';
const tones: Record<Tone, string> = {
  plain: 'bg-surface border-line',
  primary: 'bg-red border-red text-onaccent',
  call: 'bg-win border-win text-onaccent',
  danger: 'bg-surface border-line text-red-ink',
};
export function ActBtn({ tone = 'plain', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return <button type="button" className={cx('py-[13px] px-2.5 rounded-xl border font-bold', tones[tone], className)} {...rest} />;
}
export const Acts = ({ className, children }: { className?: string; children: ReactNode }) =>
  <div className={cx('grid grid-cols-2 gap-2', className)}>{children}</div>;
export const Hint = ({ children }: { children: ReactNode }) => <p className="mt-2.5 text-[13px] text-muted">{children}</p>;

/* ---------- bottom sheet ---------- */
export function Sheet({ on, onClose, children }: { on: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div
      className={cx('fixed inset-0 z-10 flex items-end justify-center bg-black/45 transition-opacity duration-200 motion-reduce:transition-none',
        on ? 'opacity-100' : 'opacity-0 pointer-events-none')}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog" aria-modal="true"
        className={cx('w-full max-w-[520px] max-h-[88vh] overflow-auto bg-surface rounded-t-[20px] p-[18px] pb-[calc(env(safe-area-inset-bottom,0px)+18px)] transition-transform duration-200 motion-reduce:transition-none',
          on ? 'translate-y-0' : 'translate-y-[30px]')}
      >
        {children}
      </div>
    </div>
  );
}

export const H2 = ({ children }: { children: ReactNode }) => <h2 className="font-display text-[28px] font-extrabold m-0 mb-3">{children}</h2>;
export const SP = ({ children, className }: { children: ReactNode; className?: string }) => <p className={cx('m-0 mb-3.5 text-muted', className)}>{children}</p>;

export function Field({ label, small, children }: { label: string; small?: string; children: ReactNode }) {
  return (
    <label className="block mb-3.5">
      <span className="block text-sm text-muted mb-1">{label}</span>
      {children}
      {small && <small className="block text-[13px] text-muted mt-1">{small}</small>}
    </label>
  );
}
export const inputCls = 'w-full p-3 rounded-[10px] border border-line bg-surface2 text-[17px]';
export const jsonCls = 'block w-full min-h-[150px] max-h-[38vh] mb-2.5 py-2.5 px-3 rounded-[10px] border border-line bg-surface2 text-ink font-mono text-[13px] leading-[1.45] resize-y';

export const SheetActs = ({ className, children }: { className?: string; children: ReactNode }) =>
  <div className={cx('flex gap-2 mt-1.5', className)}>{children}</div>;
export function SBtn({ go, green, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { go?: boolean; green?: boolean }) {
  return (
    <button
      type="button"
      className={cx('flex-1 p-3.5 rounded-xl font-bold border',
        go ? (green ? 'bg-win border-win text-onaccent' : 'bg-red border-red text-onaccent') : 'bg-surface2 border-line', className)}
      {...rest}
    />
  );
}
