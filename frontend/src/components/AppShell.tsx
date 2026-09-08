import type { ReactNode } from 'react';
import type { Room, User } from '../types';
import { displayName, initials } from '../state';

export type ViewKey = 'estimates' | 'rooms' | 'team' | 'capacity' | 'resources' | 'settings' | 'admin';

type AppShellProps = {
  user: User;
  rooms: Room[];
  selectedRoomId: string;
  view: ViewKey;
  collapsed: boolean;
  children: ReactNode;
  onRoomChange: (roomId: string) => void;
  onViewChange: (view: ViewKey) => void;
  onToggleCollapsed: () => void;
  onSignOut: () => Promise<void>;
};

const primaryNavigation: Array<{ key: ViewKey; label: string; icon: string }> = [
  { key: 'estimates', label: 'Estimates', icon: '▦' },
  { key: 'team', label: 'Team', icon: '♟' },
  { key: 'capacity', label: 'Capacity', icon: '◫' },
  { key: 'resources', label: 'Resources', icon: '▱' },
];

export function AppShell({
  user,
  rooms,
  selectedRoomId,
  view,
  collapsed,
  children,
  onRoomChange,
  onViewChange,
  onToggleCollapsed,
  onSignOut,
}: AppShellProps) {
  const room = rooms.find((candidate) => candidate.id === selectedRoomId);
  const name = displayName(user);

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand-row">
          <div className="brand"><span className="brand-mark">P</span><span className="nav-link-label">Pointline</span></div>
          <button className="sidebar-collapse" type="button" onClick={onToggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? '›' : '‹'}
          </button>
        </div>
        <p className="sidebar-kicker">Planning workspace</p>
        <div className="room-context">
          <span className="room-context-label">Current room</span>
          <select className="pl-room-select" value={selectedRoomId} onChange={(event) => onRoomChange(event.target.value)} aria-label="Current planning room">
            {rooms.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.piLabel}</option>)}
          </select>
          {!collapsed && room ? <span className="pl-room-meta">{room.memberCount} {room.memberCount === 1 ? 'planner' : 'planners'}</span> : null}
        </div>
        <nav className="sidebar-nav sidebar-room-nav" aria-label="Planning room">
          <p className="sidebar-nav-heading">Room</p>
          {primaryNavigation.map((item) => (
            <button key={item.key} className={`nav-link${view === item.key ? ' active' : ''}`} type="button" onClick={() => onViewChange(item.key)}>
              <span className="icon" aria-hidden="true">{item.icon}</span><span className="nav-link-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <nav className="sidebar-nav sidebar-general-nav" aria-label="Workspace">
          <p className="sidebar-nav-heading">Workspace</p>
          <button className={`nav-link${view === 'rooms' ? ' active' : ''}`} type="button" onClick={() => onViewChange('rooms')}>
            <span className="icon" aria-hidden="true">▤</span><span className="nav-link-label">Rooms</span><span className="nav-count">{rooms.length}</span>
          </button>
          <button className={`nav-link${view === 'settings' ? ' active' : ''}`} type="button" onClick={() => onViewChange('settings')}>
            <span className="icon" aria-hidden="true">⚙</span><span className="nav-link-label">Settings</span>
          </button>
          {user.role === 'admin' ? (
            <button className={`nav-link${view === 'admin' ? ' active' : ''}`} type="button" onClick={() => onViewChange('admin')}>
              <span className="icon" aria-hidden="true">◆</span><span className="nav-link-label">Admin</span>
            </button>
          ) : null}
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{initials(name)}</span>
          {!collapsed ? <div className="sidebar-user-copy"><strong>{name}</strong><span>{user.role === 'admin' ? 'Workspace admin' : 'Planner'}</span></div> : null}
          {!collapsed ? <button className="icon-button pl-signout" type="button" onClick={() => void onSignOut()} aria-label="Sign out">↪</button> : null}
        </div>
      </aside>
      <main className="main-area">
        <div className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span aria-hidden="true">›</span><span>{view === 'estimates' ? 'Estimates' : view[0].toUpperCase() + view.slice(1)}</span></div>
          <div className="topbar-actions"><span className="pl-topbar-user">{name}</span><button className="outline-button" type="button" onClick={() => void onSignOut()}>Sign out</button></div>
        </div>
        <div className="main-content">{children}</div>
      </main>
    </div>
  );
}
