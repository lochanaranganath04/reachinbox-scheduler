import { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { Spinner } from './Spinner';

export interface Column<T> {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading: boolean;
  error?: string | null;
  emptyTitle: string;
  emptyHint?: string;
}

export function DataTable<T>({ columns, rows, rowKey, loading, error, emptyTitle, emptyHint }: Props<T>) {
  if (loading)
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
        <Spinner /> Loading…
      </div>
    );
  if (error && rows.length === 0) return <div className="px-6 py-12 text-center text-sm text-red-600">Could not load emails: {error}</div>;
  if (rows.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c.header} className={`px-4 py-3 font-medium ${c.className ?? ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={rowKey(r)} className="hover:bg-slate-50">
              {columns.map((c) => (
                <td key={c.header} className={`px-4 py-3 ${c.className ?? ''}`}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
