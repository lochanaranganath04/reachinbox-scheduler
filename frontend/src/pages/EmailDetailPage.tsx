import DOMPurify from 'dompurify';
import { ArrowLeft, ChevronDown, ExternalLink, FileText, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, attachmentUrl } from '../api/client';
import { StatusPill } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { IconButton } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { useAuth } from '../hooks/useAuth';
import { useStars } from '../hooks/useStars';
import { formatBytes, formatFull } from '../lib/format';
import type { EmailDetail } from '../types';

export function EmailDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { stars, toggle } = useStars();
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(null);
    api.email(id).then(setEmail).catch((e: Error) => setError(e.message));
  }, [id]);

  const safeHtml = useMemo(() => (email ? DOMPurify.sanitize(email.html, { ADD_ATTR: ['target'] }) : ''), [email]);
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/scheduled'));

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-5">
      <div className="flex items-center gap-3">
        <IconButton onClick={back} aria-label="Back" className="text-slate-800">
          <ArrowLeft size={20} />
        </IconButton>
        <h1 className="min-w-0 flex-1 truncate text-lg font-medium">{email?.subject ?? (error ? 'Email unavailable' : 'Loading…')}</h1>
        {email && (
          <IconButton onClick={() => toggle(email.id)} aria-label="Star">
            <Star size={17} className={stars.has(email.id) ? 'text-amber-400' : ''} fill={stars.has(email.id) ? 'currentColor' : 'none'} />
          </IconButton>
        )}
        {user && <Avatar name={user.name} src={user.avatarUrl} size={32} />}
      </div>

      {error && <p className="mt-16 text-center text-sm text-red-600">{error}</p>}
      {!email && !error && (
        <div className="flex justify-center py-24 text-slate-400">
          <Spinner />
        </div>
      )}

      {email && (
        <div className="mx-auto mt-8 max-w-3xl">
          <div className="flex items-start gap-3">
            <Avatar name={email.fromName} size={40} tone="brand" />
            <div className="min-w-0 flex-1 leading-snug">
              <p className="text-sm">
                <span className="font-semibold">{email.fromName}</span> <span className="text-xs text-slate-500">&lt;{email.senderEmail}&gt;</span>
              </p>
              <p className="flex items-center gap-1 text-xs text-slate-500">
                to {email.toEmail} <ChevronDown size={12} />
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
              <span>{formatFull(email.status === 'sent' || email.status === 'failed' ? email.sentAt : email.scheduledAt)}</span>
              <StatusPill status={email.status} />
            </div>
          </div>

          <div className="prose-email mt-6 text-sm leading-relaxed text-slate-800 [&_blockquote]:border-l-4 [&_blockquote]:border-amber-300 [&_blockquote]:bg-amber-50 [&_blockquote]:px-3 [&_blockquote]:py-2 [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc [&_a]:text-brand-700 [&_a]:underline" dangerouslySetInnerHTML={{ __html: safeHtml }} />

          {email.error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Delivery error: {email.error}</p>}

          {email.attachments.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-3">
              {email.attachments.map((a) => (
                <a key={a.id} href={attachmentUrl(a.id)} target="_blank" rel="noreferrer" className="w-36 overflow-hidden rounded-lg bg-field">
                  {a.type.startsWith('image/') ? (
                    <img src={attachmentUrl(a.id)} alt={a.name} className="h-[72px] w-full object-cover" />
                  ) : (
                    <div className="flex h-[72px] items-center justify-center text-slate-400">
                      <FileText size={28} />
                    </div>
                  )}
                  <div className="px-2 py-1.5">
                    <p className="truncate text-xs font-medium">{a.name}</p>
                    <p className="text-[10px] text-slate-500">{formatBytes(a.size)}</p>
                  </div>
                </a>
              ))}
            </div>
          )}

          {email.previewUrl && (
            <a href={email.previewUrl} target="_blank" rel="noreferrer" className="mt-8 inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline">
              <ExternalLink size={14} /> View delivered message on Ethereal
            </a>
          )}
        </div>
      )}
    </div>
  );
}
