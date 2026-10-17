import { Upload, X } from 'lucide-react';
import { forwardRef, KeyboardEvent, useImperativeHandle, useRef, useState } from 'react';
import { extractEmails } from '../../lib/format';

export interface RecipientsHandle {
  /** Returns all valid recipients, including text still being typed. */
  flush: () => string[];
}

interface Props {
  recipients: string[];
  onChange: (next: string[]) => void;
  error?: string;
}

const VISIBLE = 3;

export const RecipientsField = forwardRef<RecipientsHandle, Props>(function RecipientsField({ recipients, onChange, error }, ref) {
  const [text, setText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const merge = (incoming: string[]) => [...new Set([...recipients, ...incoming])];

  /** Moves valid addresses from the text box into chips; invalid leftovers stay in the box. */
  const commit = (): string[] => {
    const valid = extractEmails(text);
    const leftover = text
      .split(/[\s,;]+/)
      .filter((t) => t && !valid.includes(t.toLowerCase()))
      .join(' ');
    const next = merge(valid);
    if (valid.length) onChange(next);
    setText(leftover);
    return next;
  };

  useImperativeHandle(ref, () => ({ flush: commit }));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ',', ' ', ';'].includes(e.key) && text.trim()) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && !text && recipients.length) {
      onChange(recipients.slice(0, -1));
    }
  };

  const shown = expanded ? recipients : recipients.slice(0, VISIBLE);
  const hidden = recipients.length - shown.length;

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-slate-200 pb-1.5">
        <div className="flex min-h-[28px] flex-1 flex-wrap items-center gap-1.5">
          {shown.map((r) => (
            <span key={r} className="inline-flex items-center gap-1 rounded-full border border-brand-500/50 bg-brand-50 px-2.5 py-0.5 text-xs text-slate-800">
              {r}
              <button type="button" aria-label={`Remove ${r}`} onClick={() => onChange(recipients.filter((x) => x !== r))} className="text-slate-400 hover:text-slate-700">
                <X size={11} />
              </button>
            </span>
          ))}
          {hidden > 0 && (
            <button type="button" onClick={() => setExpanded(true)} className="rounded-full border border-brand-500/50 bg-brand-50 px-2.5 py-0.5 text-xs text-slate-800">
              +{hidden}
            </button>
          )}
          {expanded && recipients.length > VISIBLE && (
            <button type="button" onClick={() => setExpanded(false)} className="text-xs text-slate-500 underline">
              show less
            </button>
          )}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            onBlur={() => text.trim() && commit()}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text');
              if (extractEmails(pasted).length > 1) {
                e.preventDefault();
                onChange(merge(extractEmails(pasted)));
              }
            }}
            placeholder={recipients.length ? '' : 'recipient@example.com'}
            aria-label="Recipients"
            className="min-w-[160px] flex-1 bg-transparent text-sm placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <button type="button" onClick={() => fileRef.current?.click()} className="flex shrink-0 items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700">
          <Upload size={14} /> Upload List
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) onChange(merge(extractEmails(await f.text())));
            e.target.value = '';
          }}
        />
      </div>
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : (
        recipients.length > 0 && <p className="mt-1 text-xs text-slate-500">{recipients.length} recipient{recipients.length === 1 ? '' : 's'} detected</p>
      )}
    </div>
  );
});
