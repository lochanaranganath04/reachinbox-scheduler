import { Mail } from 'lucide-react';

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-field text-slate-400">
        <Mail size={22} />
      </div>
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}
