import { Filter, RefreshCw, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Menu, MenuItem } from '../components/ui/Menu';
import { Spinner } from '../components/ui/Spinner';
import { EmailRow } from '../features/emails/EmailRow';
import { useDebounce } from '../hooks/useDebounce';
import { useEmails } from '../hooks/useEmails';
import { useStars } from '../hooks/useStars';
import type { EmailView } from '../types';

const FILTERS: Record<EmailView, { value: string; label: string }[]> = {
  scheduled: [
    { value: '', label: 'All' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'sending', label: 'Sending' },
  ],
  sent: [
    { value: '', label: 'All' },
    { value: 'sent', label: 'Sent' },
    { value: 'failed', label: 'Failed' },
  ],
};

export function InboxPage({ view }: { view: EmailView }) {
  const navigate = useNavigate();
  const { stars, toggle } = useStars();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search.trim());
  const { data, loading, refreshing, error, refetch } = useEmails({ view, page, q, status });

  useEffect(() => {
    setStatus('');
    setSearch('');
  }, [view]);
  useEffect(() => setPage(1), [view, q, status]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = Boolean(q || status);

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-full bg-field px-4 py-2.5">
          <Search size={16} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search emails"
            className="w-full bg-transparent text-sm placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <Menu
          align="right"
          trigger={({ toggle: t }) => (
            <IconButton onClick={t} aria-label="Filter" className={status ? 'bg-brand-50 text-brand-700' : ''}>
              <Filter size={17} />
            </IconButton>
          )}
        >
          {(close) =>
            FILTERS[view].map((f) => (
              <MenuItem
                key={f.value}
                active={status === f.value}
                onClick={() => {
                  setStatus(f.value);
                  close();
                }}
              >
                {f.label}
              </MenuItem>
            ))
          }
        </Menu>
        <IconButton onClick={refetch} aria-label="Refresh">
          <RefreshCw size={17} className={refreshing ? 'animate-spin' : ''} />
        </IconButton>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 py-24 text-slate-400">
          <Spinner /> Loading…
        </div>
      ) : error && !data ? (
        <div className="py-20 text-center text-sm text-red-600">
          Could not load emails: {error}
          <div className="mt-3">
            <Button variant="outline" onClick={refetch}>
              Retry
            </Button>
          </div>
        </div>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          title={filtered ? 'No matching emails' : view === 'scheduled' ? 'No scheduled emails' : 'No sent emails yet'}
          hint={filtered ? 'Try a different search or filter.' : view === 'scheduled' ? 'Click Compose to schedule your first campaign.' : 'Emails appear here once they are delivered.'}
        />
      ) : (
        <>
          <div className="border-t border-slate-100">
            {data?.items.map((e) => (
              <EmailRow key={e.id} email={e} starred={stars.has(e.id)} onStar={() => toggle(e.id)} onOpen={() => navigate(`/email/${e.id}`)} />
            ))}
          </div>
          {data && data.total > data.pageSize && (
            <div className="flex items-center justify-between px-3 py-4 text-sm text-slate-500">
              <span>
                Page {page} of {totalPages} · {data.total} emails
              </span>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
