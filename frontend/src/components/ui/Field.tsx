import { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string; // used as the accessible name (Figma shows placeholders only)
  error?: string;
}

/** Soft grey input from the Figma (login form). */
export function Input({ label, error, className = '', ...rest }: Props) {
  return (
    <div>
      <input
        aria-label={label}
        {...rest}
        className={`w-full rounded-lg bg-field px-4 py-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 ${error ? 'ring-1 ring-red-400' : ''} ${className}`}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
