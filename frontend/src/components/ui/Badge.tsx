import { Clock } from 'lucide-react';
import type { EmailStatus } from '../../types';
import { formatSlot } from '../../lib/format';

const styles: Record<EmailStatus, string> = {
  scheduled: 'bg-pill-bg text-pill-fg',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-slate-100 text-slate-600',
  failed: 'bg-red-100 text-red-700',
};

const label: Record<EmailStatus, string> = { scheduled: 'Scheduled', sending: 'Sending', sent: 'Sent', failed: 'Failed' };

export function StatusPill({ status }: { status: EmailStatus }) {
  return <span className={`inline-flex shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{label[status]}</span>;
}

/** Orange "clock + time" pill used on scheduled rows. */
export function SchedulePill({ iso, status }: { iso: string; status: EmailStatus }) {
  if (status === 'sending') return <StatusPill status="sending" />;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-orange-200 bg-pill-bg px-2 py-0.5 text-xs font-medium text-pill-fg">
      <Clock size={12} /> {formatSlot(iso)}
    </span>
  );
}
