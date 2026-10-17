import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { tomorrowAt, toLocalInput } from '../../lib/format';

const QUICK = [
  { label: 'Tomorrow', hour: 9 },
  { label: 'Tomorrow, 10:00 AM', hour: 10 },
  { label: 'Tomorrow, 11:00 AM', hour: 11 },
  { label: 'Tomorrow, 3:00 PM', hour: 15 },
];

interface Props {
  value: Date | null;
  onDone: (when: Date | null) => void;
  onCancel: () => void;
}

export function SendLaterPopover({ value, onDone, onCancel }: Props) {
  const [draft, setDraft] = useState(value ? toLocalInput(value) : '');
  const [error, setError] = useState('');

  const done = () => {
    if (!draft) return onDone(null);
    const d = new Date(draft);
    if (Number.isNaN(d.getTime()) || d.getTime() < Date.now() - 60_000) return setError('Pick a time in the future');
    onDone(d);
  };

  return (
    <div className="w-72 p-3">
      <p className="mb-3 text-sm font-semibold">Send Later</p>
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1.5">
        <input
          type="datetime-local"
          aria-label="Pick date and time"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError('');
          }}
          className="w-full bg-transparent text-xs text-slate-700 focus:outline-none"
        />
        <CalendarDays size={14} className="shrink-0 text-slate-400" />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <ul className="mt-3 space-y-0.5">
        {QUICK.map((q) => (
          <li key={q.label}>
            <button type="button" onClick={() => { setDraft(toLocalInput(tomorrowAt(q.hour))); setError(''); }} className="w-full rounded px-1 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50">
              {q.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-end gap-3">
        <button type="button" onClick={onCancel} className="text-sm font-medium text-slate-700">Cancel</button>
        <Button variant="outline" className="rounded-full px-4 py-1" onClick={done}>Done</Button>
      </div>
    </div>
  );
}
