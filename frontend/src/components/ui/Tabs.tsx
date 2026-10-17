interface Tab<K extends string> {
  key: K;
  label: string;
  count?: number;
}

interface Props<K extends string> {
  tabs: Tab<K>[];
  active: K;
  onChange: (key: K) => void;
}

export function Tabs<K extends string>({ tabs, active, onChange }: Props<K>) {
  return (
    <div className="flex gap-6 border-b border-slate-200" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={`-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
            active === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
