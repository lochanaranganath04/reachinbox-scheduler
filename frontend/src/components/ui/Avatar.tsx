interface Props {
  name: string;
  src?: string | null;
  size?: number;
  tone?: 'brand' | 'soft';
}

export function Avatar({ name, src, size = 36, tone = 'soft' }: Props) {
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (src) return <img src={src} alt="" referrerPolicy="no-referrer" style={style} className="shrink-0 rounded-full object-cover" />;
  return (
    <div
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold uppercase ${tone === 'brand' ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-700'}`}
    >
      {name[0] ?? '?'}
    </div>
  );
}
