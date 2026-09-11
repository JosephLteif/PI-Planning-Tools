import { AppIcon } from './AppIcon';

type EmptyWorkspacePageProps = {
  onRefresh: () => void;
};

export function EmptyWorkspacePage({ onRefresh }: EmptyWorkspacePageProps) {
  return <div className="empty-workspace-page">
    <section className="card empty-workspace-card">
      <div className="empty-workspace-icon"><AppIcon name="door" size={28} /></div>
      <p className="section-kicker">Workspace access</p>
      <h1>No planning room yet.</h1>
      <p>You are signed in, but you have not been assigned to a planning room. A platform admin needs to add you before you can start planning.</p>
      <button className="primary-button" type="button" onClick={onRefresh}><AppIcon name="refresh" size={15} /> Check again</button>
      <div className="empty-workspace-help"><AppIcon name="clock" size={15} /><span>Ask your platform admin to assign you to a room, then check again.</span></div>
    </section>
  </div>;
}
