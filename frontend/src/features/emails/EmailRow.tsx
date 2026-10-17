import { Star } from 'lucide-react';
import { SchedulePill, StatusPill } from '../../components/ui/Badge';
import { formatShort } from '../../lib/format';
import type { EmailItem } from '../../types';

interface Props {
  email: EmailItem;
  starred: boolean;
  onOpen: () => void;
  onStar: () => void;
}

export function EmailRow({ email, starred, onOpen, onStar }: Props) {
  const isScheduled = email.status === 'scheduled' || email.status === 'sending';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="flex cursor-pointer items-center gap-4 border-b border-slate-100 px-3 py-3 text-sm hover:bg-slate-50"
    >
      <span className="w-44 shrink-0 truncate font-medium text-slate-800 sm:w-56">To: {email.toEmail}</span>
      {isScheduled ? <SchedulePill iso={email.scheduledAt} status={email.status} /> : <StatusPill status={email.status} />}
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold text-slate-900">{email.subject}</span>
        {email.preview && <span className="text-slate-400"> - {email.preview}</span>}
      </span>
      {!isScheduled && <span className="hidden shrink-0 text-xs text-slate-400 md:block">{formatShort(email.sentAt)}</span>}
      <button
        aria-label={starred ? 'Unstar' : 'Star'}
        onClick={(e) => {
          e.stopPropagation();
          onStar();
        }}
        className={`shrink-0 ${starred ? 'text-amber-400' : 'text-slate-300 hover:text-slate-500'}`}
      >
        <Star size={16} fill={starred ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}
