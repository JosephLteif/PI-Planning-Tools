import type { ReactNode } from 'react';
import type { Room, User } from '../types';
import { displayName, initials } from '../state';
import { AppIcon, type AppIconName } from './AppIcon';

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
  onSwitchAccount: () => Promise<void>;
  onSignOut: () => Promise<void>;
};

const primaryNavigation: Array<{ key: ViewKey; label: string; icon: AppIconName }> = [
  { key: 'estimates', label: 'Estimates', icon: 'layout' },
  { key: 'capacity', label: 'Capacity', icon: 'gauge' },
  { key: 'resources', label: 'Resources', icon: 'boxes' },
  { key: 'settings', label: 'Room settings', icon: 'settings' },
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
  onSwitchAccount,
  onSignOut,
}: AppShellProps) {
  const room = rooms.find((candidate) => candidate.id === selectedRoomId);
  const name = displayName(user);

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand-row">
          <div className="brand"><span className="brand-mark">P</span><span className="nav-link-label">Pointline</span></div>
          <button className="sidebar-collapse" type="button" onClick={onToggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <AppIcon name={collapsed ? 'panelOpen' : 'panelClose'} size={16} />
          </button>
        </div>
        <p className="sidebar-kicker">Planning workspace</p>
        <div className="room-context" title={room ? `${room.name} · ${room.piLabel}` : 'Current planning room'}>
          <span className="room-context-label">Current room</span>
          <label className="room-selector">
            <AppIcon name="door" size={17} />
            <span className="room-selector-copy"><strong>{room?.name || 'Select a room'}</strong><span>{room?.piLabel || 'Planning room'}</span></span>
            <AppIcon name="chevronDown" size={14} className="room-selector-chevron" />
            <select className="room-selector-control" value={selectedRoomId} onChange={(event) => onRoomChange(event.target.value)} aria-label="Current planning room">
              {rooms.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.piLabel}</option>)}
            </select>
          </label>
          {!collapsed && room ? <span className="pl-room-meta">{room.memberCount} {room.memberCount === 1 ? 'planner' : 'planners'}</span> : null}
        </div>
        <nav className="sidebar-nav sidebar-room-nav" aria-label="Planning room">
          <p className="sidebar-nav-heading">Room</p>
          {primaryNavigation.map((item) => (
            <button key={item.key} className={`nav-link${view === item.key ? ' active' : ''}`} type="button" onClick={() => onViewChange(item.key)} aria-label={item.label} title={collapsed ? item.label : undefined}>
              <AppIcon name={item.icon} size={16} /><span className="nav-link-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <nav className="sidebar-nav sidebar-general-nav" aria-label="Workspace">
          <p className="sidebar-nav-heading">Workspace</p>
          <button className={`nav-link${view === 'rooms' ? ' active' : ''}`} type="button" onClick={() => onViewChange('rooms')} aria-label="Rooms" title={collapsed ? 'Rooms' : undefined}>
            <AppIcon name="door" size={16} /><span className="nav-link-label">Rooms</span><span className="nav-count">{rooms.length}</span>
          </button>
          {user.role === 'admin' ? (
            <button className={`nav-link${view === 'admin' ? ' active' : ''}`} type="button" onClick={() => onViewChange('admin')} aria-label="Admin" title={collapsed ? 'Admin' : undefined}>
              <AppIcon name="shield" size={16} /><span className="nav-link-label">Admin</span>
            </button>
          ) : null}
          <button className={`nav-link${view === 'team' ? ' active' : ''}`} type="button" onClick={() => onViewChange('team')} aria-label="Team" title={collapsed ? 'Team' : undefined}>
            <AppIcon name="users" size={16} /><span className="nav-link-label">Team</span>
          </button>
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{initials(name)}</span>
          <div className="sidebar-user-copy"><strong>{name}</strong><span>{user.role === 'admin' ? 'Workspace admin' : 'Planner'}</span></div>
          <div className="sidebar-user-actions">
            <button className="icon-button" type="button" onClick={() => void onSwitchAccount()} aria-label="Switch account" title="Switch account"><AppIcon name="arrowRightLeft" size={15} /></button>
            <button className="icon-button pl-signout" type="button" onClick={() => void onSignOut()} aria-label="Sign out" title="Sign out"><AppIcon name="logOut" size={15} /></button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <div className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><AppIcon name="chevronRight" size={13} /><span>{view === 'estimates' ? 'Estimates' : view === 'settings' ? 'Room settings' : view[0].toUpperCase() + view.slice(1)}</span></div>
          <div className="topbar-actions"><span className="pl-topbar-user">{name}</span><button className="outline-button" type="button" onClick={() => void onSwitchAccount()}><AppIcon name="arrowRightLeft" size={14} /> Switch account</button></div>
        </div>
        <div className="main-content">{children}</div>
      </main>
    </div>
  );
}

