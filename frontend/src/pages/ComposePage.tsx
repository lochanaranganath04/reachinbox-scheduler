import { ArrowLeft, ChevronDown, Clock, FileText, Paperclip, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Button, IconButton } from '../components/ui/Button';
import { Menu, MenuItem } from '../components/ui/Menu';
import { useToast } from '../components/ui/Toast';
import { RecipientsField, RecipientsHandle } from '../features/compose/RecipientsField';
import { EditorHandle, RichTextEditor } from '../features/compose/RichTextEditor';
import { SendLaterPopover } from '../features/compose/SendLaterPopover';
import { fileToBase64, formatBytes, formatShort } from '../lib/format';
import type { SenderOption } from '../types';

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;

const smallInput =
  'h-8 w-14 rounded-md border border-slate-200 bg-white px-2 text-center text-xs placeholder:text-slate-300 focus:border-brand-500 focus:outline-none';

export function ComposePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const editor = useRef<EditorHandle>(null);
  const recipientsRef = useRef<RecipientsHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [senders, setSenders] = useState<SenderOption[]>([]);
  const [senderId, setSenderId] = useState<string>('all');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [delay, setDelay] = useState('');
  const [hourly, setHourly] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sendAt, setSendAt] = useState<Date | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.senders().then(setSenders).catch(() => toast('error', 'Could not load senders'));
  }, [toast]);

  const previews = useMemo(() => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const fromLabel = senderId === 'all' ? 'All senders (rotate)' : senders.find((s) => s.id === senderId)?.email ?? 'Select sender';

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next = [...files, ...Array.from(incoming)];
    if (next.length > MAX_FILES) return toast('error', `Up to ${MAX_FILES} attachments`);
    if (next.reduce((n, f) => n + f.size, 0) > MAX_BYTES) return toast('error', 'Attachments are limited to 5 MB in total');
    setFiles(next);
  };

  const submit = async () => {
    const leads = recipientsRef.current?.flush() ?? recipients;
    const err: Record<string, string> = {};
    if (leads.length === 0) err.to = 'Add at least one recipient or upload a list';
    if (!subject.trim()) err.subject = 'Subject is required';
    if (editor.current?.isEmpty()) err.body = 'Write a message before sending';
    if (delay !== '' && !(Number(delay) >= 0)) err.limits = 'Delay must be 0 or more seconds';
    if (hourly !== '' && !(Number(hourly) >= 1)) err.limits = 'Hourly limit must be at least 1';
    setErrors(err);
    if (Object.keys(err).length) return;

    setSubmitting(true);
    try {
      const attachments = await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type || 'application/octet-stream', data: await fileToBase64(f) })));
      const r = await api.schedule({
        subject: subject.trim(),
        body: editor.current!.getHtml(),
        leads,
        startTime: (sendAt ?? new Date(Date.now() + 2000)).toISOString(),
        delaySeconds: delay === '' ? 0 : Number(delay),
        hourlyLimit: hourly === '' ? 1000 : Math.floor(Number(hourly)), // server clamps to its configured cap
        senderId: senderId === 'all' ? undefined : senderId,
        attachments,
      });
      toast('success', `Scheduled ${r.count} email${r.count === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} skipped)` : ''}`);
      navigate('/scheduled');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen px-6 py-5">
      <div className="flex items-center gap-3">
        <IconButton onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/scheduled'))} aria-label="Back" className="text-slate-800">
          <ArrowLeft size={20} />
        </IconButton>
        <h1 className="flex-1 text-lg font-medium">Compose New Email</h1>

        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach files" className="relative flex h-8 w-8 items-center justify-center rounded-md text-brand-600 hover:bg-brand-50">
          <Paperclip size={17} />
          {files.length > 0 && <span className="absolute bottom-0.5 right-0.5 text-[9px] font-semibold">{files.length}</span>}
        </button>

        <Menu
          align="right"
          trigger={({ toggle }) => (
            <IconButton onClick={toggle} aria-label="Send later" className={sendAt ? 'text-brand-600' : ''}>
              <Clock size={17} />
            </IconButton>
          )}
        >
          {(close) => <SendLaterPopover value={sendAt} onCancel={close} onDone={(d) => { setSendAt(d); close(); }} />}
        </Menu>

        <Button variant="outline" className="rounded-full px-5 py-1.5" loading={submitting} onClick={submit}>
          {sendAt ? 'Send Later' : 'Send'}
        </Button>
      </div>

      <div className="mx-auto mt-6 max-w-4xl space-y-5">
        {sendAt && (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-slate-700">
            Scheduled to start {formatShort(sendAt.toISOString())}.{' '}
            <button type="button" className="text-brand-700 underline" onClick={() => setSendAt(null)}>Send now instead</button>
          </p>
        )}

        <div className="flex items-center gap-4">
          <span className="w-14 text-xs text-slate-700">From</span>
          <Menu
            trigger={({ toggle }) => (
              <button type="button" onClick={toggle} className="flex items-center gap-2 rounded-lg bg-field px-3 py-1.5 text-sm">
                {fromLabel} <ChevronDown size={14} className="text-slate-400" />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem active={senderId === 'all'} onClick={() => { setSenderId('all'); close(); }}>All senders (rotate)</MenuItem>
                {senders.map((s) => (
                  <MenuItem key={s.id} active={senderId === s.id} onClick={() => { setSenderId(s.id); close(); }}>{s.email}</MenuItem>
                ))}
              </>
            )}
          </Menu>
        </div>

        <div className="flex items-start gap-4">
          <span className="w-14 pt-1 text-xs text-slate-700">To</span>
          <div className="flex-1">
            <RecipientsField ref={recipientsRef} recipients={recipients} onChange={setRecipients} error={errors.to} />
          </div>
        </div>

        <div className="flex items-start gap-4">
          <span className="w-14 pt-1 text-xs text-slate-700">Subject</span>
          <div className="flex-1">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              aria-label="Subject"
              className="w-full border-b border-slate-200 bg-transparent pb-1.5 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
            />
            {errors.subject && <p className="mt-1 text-xs text-red-600">{errors.subject}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-700">
          <label className="flex items-center gap-2">
            Delay between 2 emails
            <input type="number" min={0} step="any" value={delay} onChange={(e) => setDelay(e.target.value)} placeholder="00" className={smallInput} aria-label="Delay between emails in seconds" />
            <span className="text-slate-400">sec</span>
          </label>
          <label className="flex items-center gap-2">
            Hourly Limit
            <input type="number" min={1} value={hourly} onChange={(e) => setHourly(e.target.value)} placeholder="00" className={smallInput} aria-label="Hourly limit per sender" />
          </label>
          {errors.limits && <span className="text-red-600">{errors.limits}</span>}
        </div>

        <div>
          <RichTextEditor ref={editor} />
          {errors.body && <p className="mt-1 text-xs text-red-600">{errors.body}</p>}
        </div>

        {files.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="relative w-32 overflow-hidden rounded-lg bg-field">
                {previews[i] ? (
                  <img src={previews[i]!} alt={f.name} className="h-20 w-full object-cover" />
                ) : (
                  <div className="flex h-20 items-center justify-center text-slate-400"><FileText size={26} /></div>
                )}
                <div className="px-2 py-1">
                  <p className="truncate text-xs font-medium">{f.name}</p>
                  <p className="text-[10px] text-slate-500">{formatBytes(f.size)}</p>
                </div>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-slate-600 hover:text-slate-900">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
