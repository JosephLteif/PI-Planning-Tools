import { ChangeEvent, FormEvent, useState } from 'react';
import type { AdminUser } from '../types';
import { initials } from '../state';

type AdminPageProps = {
  users: AdminUser[];
  currentUserId: string;
  saving: boolean;
  onCreate: (input: { displayName: string; username: string; password: string }) => Promise<{ username: string; password: string } | null>;
  onUpdate: (accountId: string, input: { displayName: string; username: string; password?: string }) => Promise<{ username: string; password: string } | null>;
  onDelete: (accountId: string) => Promise<void>;
  onExport: () => Promise<void>;
  onImport: (file: File) => Promise<void>;
};

export function AdminPage({ users, currentUserId, saving, onCreate, onUpdate, onDelete, onExport, onImport }: AdminPageProps) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await onCreate({ displayName: displayName.trim(), username: username.trim(), password });
    if (result) {
      setCredentials(result);
      setDisplayName('');
      setUsername('');
      setPassword('');
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const result = await onUpdate(editing.id, { displayName: displayName.trim(), username: username.trim(), password: password || undefined });
    if (result) setCredentials(result);
    setEditing(null);
    setPassword('');
  }

  function startEdit(account: AdminUser) {
    setEditing(account);
    setDisplayName(account.name || '');
    setUsername(account.username || '');
    setPassword('');
  }

  async function remove(account: AdminUser) {
    if (account.id === currentUserId || !window.confirm('Remove ' + account.name + ' permanently? This deletes the account and its memberships.')) return;
    await onDelete(account.id);
  }

  function selectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (window.confirm('Import this backup? Matching records will be updated, records not in the file will remain, and imported users will keep their existing credentials.')) {
      void onImport(file);
    }
  }

  const credentialText = ['Username: ' + (credentials?.username || ''), 'Password: ' + (credentials?.password || ''), 'Pointline: ' + window.location.origin].join('\n');
  const form = <form className="admin-user-form" onSubmit={editing ? submitEdit : submit}>
    <label className="modal-field"><span>Display name</span><input className="modal-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Alex Morgan" required /></label>
    <label className="modal-field"><span>Username</span><input className="modal-input" value={username} onChange={(event) => setUsername(event.target.value)} pattern="[A-Za-z][A-Za-z0-9._-]{2,39}" minLength={3} maxLength={40} placeholder="alex.morgan" required /></label>
    <label className="modal-field"><span>{editing ? 'New password' : 'Temporary password'} {editing ? <small>(optional)</small> : null}</span><input className="modal-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={editing ? 0 : 12} autoComplete="new-password" placeholder={editing ? 'Leave blank to keep it' : 'At least 12 characters'} required={!editing} /></label>
    <div className="footer-actions"><button className="primary-button" type="submit" disabled={saving}>{editing ? 'Save account' : 'Create credentials'}</button>{editing ? <button className="outline-button" type="button" onClick={() => { setEditing(null); setPassword(''); }}>Cancel</button> : null}</div>
  </form>;

  return <div className="management-content">
    <div className="hero-row">
      <div><p className="eyebrow">Workspace · administration</p><h1>Manage Pointline users.</h1><p className="hero-copy">Create member accounts and share temporary credentials privately. Passwords are never returned by the list endpoint.</p></div>
      <section className="card">
        <p className="section-kicker">Migration</p>
        <h2>Move this workspace</h2>
        <p className="hero-copy">Export rooms, epics, stories, estimates, teams, memberships, rounds, votes, capacity, invites, and user accounts for another Pointline instance.</p>
        <div className="footer-actions">
          <button className="outline-button" type="button" disabled={saving} onClick={() => void onExport()}>Export backup</button>
          <label className="outline-button" htmlFor="pointline-backup-input">Import backup</label>
          <input id="pointline-backup-input" type="file" accept=".json,application/json" hidden disabled={saving} onChange={selectBackup} />
        </div>
        <small>Backups contain password hashes so imported users keep their credentials. Treat the JSON file as sensitive.</small>
      </section>
    </div>
    <section className="admin-layout">
      <section className="card admin-create-card">
        <div className="section-heading"><div><p className="section-kicker">{editing ? 'Account settings' : 'New account'}</p><h2>{editing ? 'Edit ' + editing.name : 'Create a user'}</h2></div></div>
        {form}
        {credentials ? <div className="credential-callout"><p className="section-kicker">Ready to share</p><h3>{credentials.username}</h3><pre>{credentialText}</pre><button className="outline-button" type="button" onClick={() => void navigator.clipboard?.writeText(credentialText)}>Copy credentials</button></div> : null}
      </section>
      <section className="card admin-users-card">
        <div className="section-heading"><div><p className="section-kicker">Accounts</p><h2>Pointline users</h2></div><span className="section-count">{users.length}</span></div>
        <div className="admin-user-list">{users.length ? users.map((account) => <div className="admin-user-row" key={account.id}><span className="avatar small-avatar">{initials(account.name || account.username || 'P')}</span><span><strong>{account.name}</strong><small>@{account.username || 'legacy'} · {account.role === 'admin' ? 'Administrator' : 'Member'}</small></span><span className="member-role">{account.disabled ? 'Disabled' : 'Active'}</span><button className="outline-button admin-edit-button" type="button" onClick={() => startEdit(account)}>Edit</button>{account.id !== currentUserId ? <button className="story-action-button danger-action" type="button" disabled={saving} onClick={() => void remove(account)} aria-label={'Remove ' + account.name}>×</button> : null}</div>) : <p className="empty-manager">No accounts yet.</p>}</div>
      </section>
    </section>
  </div>;
}
