import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { Spinner } from './components/ui/Spinner';
import { useAuth } from './hooks/useAuth';
import { ComposePage } from './pages/ComposePage';
import { EmailDetailPage } from './pages/EmailDetailPage';
import { InboxPage } from './pages/InboxPage';
import { LoginPage } from './pages/LoginPage';

/** After OAuth the API redirects to "/" (possibly with ?slack=...): keep the query and land on the inbox. */
function Home() {
  const { search } = useLocation();
  return <Navigate to={`/scheduled${search}`} replace />;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        <Spinner className="h-8 w-8" />
      </div>
    );
  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route element={<AppLayout />}>
        <Route path="/scheduled" element={<InboxPage view="scheduled" />} />
        <Route path="/sent" element={<InboxPage view="sent" />} />
      </Route>
      <Route path="/compose" element={<ComposePage />} />
      <Route path="/email/:id" element={<EmailDetailPage />} />
      <Route path="*" element={<Navigate to="/scheduled" replace />} />
    </Routes>
  );
}
