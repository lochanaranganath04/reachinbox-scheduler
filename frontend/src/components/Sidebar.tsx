import { ChevronDown, Clock, LogOut, Send } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useStats } from '../hooks/useStats';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Logo } from './Logo';
import { Menu, MenuItem } from './ui/Menu';
import { SlackMenuItem } from '../features/slack/SlackMenuItem';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? 'bg-brand-50 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`;

export function Sidebar() {
  const { user, logout } = useAuth();
  const stats = useStats();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-3 p-4">
      <Logo className="mb-1 px-1" />

      <Menu
        className="w-full"
        trigger={({ toggle }) => (
          <button onClick={toggle} className="flex w-full items-center gap-3 rounded-xl bg-field px-3 py-2 text-left">
            <Avatar name={user.name} src={user.avatarUrl} size={34} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-[11px] text-slate-500">{user.email}</span>
            </span>
            <ChevronDown size={16} className="text-slate-400" />
          </button>
        )}
      >
        {(close) => (
          <>
            <SlackMenuItem onDone={close} />
            <MenuItem onClick={logout}>
              <LogOut size={15} /> Logout
            </MenuItem>
          </>
        )}
      </Menu>

      <Button variant="outline" className="w-full" onClick={() => navigate('/compose')}>
        Compose
      </Button>

      <p className="mt-2 px-3 text-[11px] font-medium uppercase tracking-wider text-slate-400">Core</p>
      <nav className="flex flex-col gap-1">
        <NavLink to="/scheduled" className={navClass}>
          <Clock size={16} />
          <span className="flex-1">Scheduled</span>
          <span className="text-xs text-slate-500">{stats.scheduled}</span>
        </NavLink>
        <NavLink to="/sent" className={navClass}>
          <Send size={16} />
          <span className="flex-1">Sent</span>
          <span className="text-xs text-slate-500">{stats.sent}</span>
        </NavLink>
      </nav>
    </aside>
  );
}
