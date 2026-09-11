import { useState, type FormEvent } from 'react';
import { AppIcon } from './AppIcon';
import type { DiscoverableRoom } from '../types';

type EmptyWorkspacePageProps = {
  rooms: DiscoverableRoom[];
  saving: boolean;
  loading: boolean;
  hasMore: boolean;
  query: string;
  onJoin: (roomId: string) => Promise<void>;
  onSearch: (query: string) => Promise<void>;
  onLoadMore: () => Promise<void>;
  onRefresh: () => void;
};

export function EmptyWorkspacePage({ rooms, saving, loading, hasMore, query, onJoin, onSearch, onLoadMore, onRefresh }: EmptyWorkspacePageProps) {
  const [search, setSearch] = useState(query);

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSearch(search);
  }

  function refresh() {
    setSearch('');
    onRefresh();
  }

  return <div className="empty-workspace-page">
    <section className="card empty-workspace-card">
      <div className="empty-workspace-icon"><AppIcon name="door" size={28} /></div>
      <p className="section-kicker">Workspace access</p>
      <h1>Find a planning room.</h1>
      <p>You are not in a planning room yet. Browse the available rooms below and join one when you are ready to start planning.</p>
      <div className="discoverable-room-toolbar">
        <div className="discoverable-room-heading"><strong>Available rooms</strong><span>{rooms.length}{hasMore ? '+' : ''} shown{query ? ` for “${query}”` : ''}</span></div>
        <form className="discoverable-room-search" onSubmit={(event) => void submitSearch(event)}>
          <input className="modal-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rooms…" aria-label="Search rooms" maxLength={80} />
          <button className="outline-button" type="submit" disabled={loading}><AppIcon name="search" size={14} /> Search</button>
        </form>
      </div>
      <div className="discoverable-room-list">
        {loading && !rooms.length ? <div className="discoverable-room-empty"><AppIcon name="clock" size={16} /><span>Loading available rooms…</span></div> : rooms.length ? rooms.map((room) => (
          <div className="discoverable-room" key={room.id}>
            <div className="discoverable-room-copy">
              <strong>{room.name}</strong>
              <span>{room.piLabel} · {room.teamCount} {room.teamCount === 1 ? 'team' : 'teams'} · {room.memberCount} {room.memberCount === 1 ? 'planner' : 'planners'}</span>
            </div>
            <button className="primary-button" type="button" disabled={saving || loading} onClick={() => void onJoin(room.id)}>Join room</button>
          </div>
        )) : <div className="discoverable-room-empty"><AppIcon name="clock" size={16} /><span>{query ? `No rooms match “${query}”.` : 'No rooms are available right now. Check again after a room has been created.'}</span></div>}
      </div>
      {hasMore ? <button className="outline-button discoverable-room-load-more" type="button" disabled={loading} onClick={() => void onLoadMore()}>{loading ? 'Loading rooms…' : 'Load more rooms'}</button> : null}
      <button className="outline-button empty-workspace-refresh" type="button" disabled={saving || loading} onClick={refresh}><AppIcon name="refresh" size={15} /> Refresh rooms</button>
      <div className="empty-workspace-help"><AppIcon name="users" size={15} /><span>You can join any available room without waiting for a manual assignment.</span></div>
    </section>
  </div>;
}
