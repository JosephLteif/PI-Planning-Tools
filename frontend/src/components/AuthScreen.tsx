import { FormEvent, useState } from 'react';

type AuthScreenProps = {
  error: string;
  loading: boolean;
  onSubmit: (username: string, password: string) => Promise<void>;
};

export function AuthScreen({ error, loading, onSubmit }: AuthScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(username.trim(), password);
  }

  return (
    <main className="auth-app">
      <div className="auth-shell">
        <section className="auth-card">
          <div className="auth-brand"><span className="brand-mark">P</span> Pointline</div>
          <p className="eyebrow">PI planning workspace</p>
          <h1>Plan with clarity.</h1>
          <p className="auth-copy">Sign in to open your shared estimation rooms and keep planning decisions in one place.</p>
          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="modal-field">
              <span>Username</span>
              <input className="modal-input" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
            </label>
            <label className="modal-field">
              <span>Password</span>
              <input className="modal-input" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            {error ? <div className="auth-error" role="alert">{error}</div> : null}
            <button className="primary-button auth-submit" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="auth-footnote">Your administrator creates accounts for this Pointline installation.</p>
        </section>
      </div>
    </main>
  );
}
