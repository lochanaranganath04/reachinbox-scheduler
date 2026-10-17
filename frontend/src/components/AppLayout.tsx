import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useToast } from './ui/Toast';

/** Sidebar shell for the inbox views. Also reports the result of the Slack OAuth round trip. */
export function AppLayout() {
  const toast = useToast();
  const { search, pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const slack = new URLSearchParams(search).get('slack');
    if (!slack) return;
    toast(slack === 'connected' ? 'success' : 'error', slack === 'connected' ? 'Slack connected. Check your channel!' : 'Slack connection failed');
    navigate(pathname, { replace: true });
  }, [search, pathname, navigate, toast]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 py-4 pr-6">
        <Outlet />
      </main>
    </div>
  );
}
