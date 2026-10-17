import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

type Kind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
}

const ToastContext = createContext<(kind: Kind, message: string) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

const colors: Record<Kind, string> = {
  success: 'bg-brand-600',
  error: 'bg-red-600',
  info: 'bg-slate-800',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: Kind, message: string) => {
    const id = Date.now() + Math.random();
    setItems((cur) => [...cur, { id, kind, message }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg ${colors[t.kind]}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
