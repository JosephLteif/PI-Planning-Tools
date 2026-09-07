const STORAGE_KEY = 'pointline-pi-room-v1';
const PARTICIPANT_ID_KEY = 'pointline-participant-id-v1';
const ROOM_ID_KEY = 'pointline-room-id-v1';
const WORKSPACE_KEY = 'pointline-workspace-v1';
const LOCAL_DEFAULT_ROOM_ID = 'local-commerce';

const sequences = {
  sequential: {
    label: 'Sequential',
    helper: 'Whole numbers, 1 through 10',
    values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
  fibonacci: {
    label: 'Fibonacci',
    helper: '1, 2, 3, 5, 8, 13, 21',
    values: [1, 2, 3, 5, 8, 13, 21],
  },
  modified: {
    label: 'Modified Fibonacci',
    helper: 'Extra space for very large work',
    values: [1, 2, 3, 5, 8, 13, 20, 40],
  },
};

const initialStories = [
  {
    id: 'PL-104',
    type: 'Feature',
    title: 'Role-based access for shared workspaces',
    description: 'As a workspace owner, I want to assign roles to collaborators so that the right people can plan and edit work without stepping on each other.',
    acceptance: ['Owner / editor roles', 'Invite flow', 'Permission guardrails'],
    manual: 5,
    ai: 8,
    aiEnabled: true,
    saved: true,
    serviceLinks: [{ serviceId: 'svc-identity', allocation: 100 }],
  },
  {
    id: 'PL-105',
    type: 'Improvement',
    title: 'Remember the team’s preferred point sequence',
    description: 'As a facilitator, I want our room to remember the selected point sequence so every planning session starts with the same vocabulary.',
    acceptance: ['Room setting', 'Restore on load'],
    manual: 3,
    ai: 3,
    aiEnabled: true,
    saved: true,
    serviceLinks: [{ serviceId: 'svc-planning', allocation: 100 }],
  },
  {
    id: 'PL-106',
    type: 'Feature',
    title: 'Export estimates into the PI backlog',
    description: 'As a product manager, I want to export the final estimates so I can carry the planning outcome into our delivery board.',
    acceptance: ['CSV export', 'Story point mapping'],
    manual: 8,
    ai: null,
    saved: true,
    serviceLinks: [{ serviceId: 'svc-planning', allocation: 100 }],
  },
  {
    id: 'PL-107',
    type: 'Tech debt',
    title: 'Retire the legacy planning webhook',
    description: 'As an engineer, I want to remove the old webhook path so planning updates only travel through the supported integration.',
    acceptance: ['Migration check', 'Remove fallback'],
    manual: null,
    ai: null,
    saved: false,
    serviceLinks: [{ serviceId: 'svc-platform', allocation: 100 }],
  },
  {
    id: 'PL-108',
    type: 'Feature',
    title: 'Show capacity by team and sprint',
    description: 'As a release lead, I want a simple capacity view so we can spot over-commitment before the PI starts.',
    acceptance: ['Team totals', 'Sprint breakdown'],
    manual: null,
    ai: null,
    saved: false,
    serviceLinks: [{ serviceId: 'svc-commerce', allocation: 100 }],
  },
  {
    id: 'PL-109',
    type: 'Improvement',
    title: 'Add a quiet observer mode',
    description: 'As a stakeholder, I want to follow the room without voting so I can stay informed without affecting the estimate.',
    acceptance: ['Read-only access'],
    manual: null,
    ai: null,
    saved: false,
    serviceLinks: [],
  },
  {
    id: 'PL-110',
    type: 'Feature',
    title: 'Capture the decision behind an estimate',
    description: 'As a facilitator, I want to leave a short note on an estimate so future teams understand what drove the number.',
    acceptance: ['Optional note', 'Visible in history'],
    manual: null,
    ai: null,
    saved: false,
    serviceLinks: [{ serviceId: 'svc-planning', allocation: 100 }],
  },
  {
    id: 'PL-111',
    type: 'Feature',
    title: 'Archive the room when PI planning ends',
    description: 'As a room owner, I want to archive the planning room so the next PI starts with a clean story queue.',
    acceptance: ['Archive action', 'Read-only history'],
    manual: null,
    ai: null,
    saved: false,
    serviceLinks: [{ serviceId: 'svc-platform', allocation: 100 }],
  },
];

const defaultDomains = [
  { id: 'domain-customer', name: 'Customer experience' },
  { id: 'domain-platform', name: 'Platform & enablement' },
];

const defaultServices = [
  { id: 'svc-commerce', name: 'Commerce', domainId: 'domain-customer' },
  { id: 'svc-identity', name: 'Identity', domainId: 'domain-platform' },
  { id: 'svc-planning', name: 'Planning workspace', domainId: 'domain-platform' },
  { id: 'svc-platform', name: 'Platform foundations', domainId: 'domain-platform' },
];

const defaultState = {
  resourceModelVersion: 1,
  sequence: 'fibonacci',
  selectedStoryId: 'PL-104',
  stories: initialStories,
  domains: defaultDomains,
  services: defaultServices,
  round: {
    phase: 'idle',
    mode: 'hidden',
    storyId: 'PL-104',
    roundNumber: 1,
    submittedCount: 0,
    votes: {},
    cardFlipped: false,
    revealedAt: null,
  },
};

const defaultWorkspace = {
  rooms: [{ id: LOCAL_DEFAULT_ROOM_ID, name: 'Commerce platform', piLabel: 'PI 24', memberCount: 1, role: 'owner' }],
  teams: [{
    id: 'local-team-commerce',
    name: 'Commerce planning',
    role: 'owner',
    members: [{ id: 'local-planner', name: 'Jordan L.', email: '', role: 'owner' }],
  }],
};

function loadLocalWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem(WORKSPACE_KEY));
    if (!saved || !Array.isArray(saved.rooms) || !Array.isArray(saved.teams)) return structuredClone(defaultWorkspace);
    return {
      rooms: saved.rooms.map((room) => ({
        id: String(room.id || '').trim(),
        name: String(room.name || 'Untitled room').trim() || 'Untitled room',
        piLabel: String(room.piLabel || 'New PI').trim() || 'New PI',
        memberCount: Math.max(1, Number(room.memberCount) || 1),
        role: room.role === 'member' ? 'member' : 'owner',
      })).filter((room) => room.id),
      teams: saved.teams.map((team) => ({
        id: String(team.id || '').trim(),
        name: String(team.name || 'Untitled team').trim() || 'Untitled team',
        role: team.role === 'member' ? 'member' : 'owner',
        members: Array.isArray(team.members) ? team.members.map((member) => ({
          id: String(member.id || '').trim(),
          name: String(member.name || 'Planner').trim() || 'Planner',
          email: String(member.email || '').trim(),
          role: member.role === 'member' ? 'member' : 'owner',
        })).filter((member) => member.id) : [],
      })).filter((team) => team.id),
    };
  } catch {
    return structuredClone(defaultWorkspace);
  }
}

function saveLocalWorkspace() {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(localWorkspace));
}

const localWorkspace = loadLocalWorkspace();
let activeRoomId = getConfiguredRoomId() || localWorkspace.rooms[0]?.id || LOCAL_DEFAULT_ROOM_ID;
let activeView = getViewFromLocation();
let state = loadState(activeRoomId);
let toastTimer;
let importDraft = { mode: 'text', text: '', fileName: '' };
let cloud = {
  user: null,
  roomId: activeRoomId,
  room: localWorkspace.rooms.find((room) => room.id === activeRoomId) || localWorkspace.rooms[0] || defaultWorkspace.rooms[0],
  rooms: localWorkspace.rooms,
  teams: localWorkspace.teams,
  selectedTeamId: localWorkspace.teams[0]?.id || null,
  status: 'local',
  memberCount: 1,
};

const siteRuntime = {
  enabled: window.location.hostname.endsWith('.chatgpt.site'),
  ready: false,
  pollTimer: null,
  saveTimer: null,
  saveInFlight: false,
  stateRevision: 0,
  syncedRevision: 0,
  refreshing: false,
};

const participantId = getOrCreateParticipantId();

function getOrCreateParticipantId() {
  try {
    const existing = localStorage.getItem(PARTICIPANT_ID_KEY);
    if (existing) return existing;
    const id = globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(PARTICIPANT_ID_KEY, id);
    return id;
  } catch {
    return `local-${Date.now()}`;
  }
}

function makeRound(storyId, mode = 'hidden', roundNumber = 1) {
  return {
    phase: 'idle',
    mode: mode === 'open' ? 'open' : 'hidden',
    storyId,
    roundNumber,
    submittedCount: 0,
    votes: {},
    cardFlipped: false,
    revealedAt: null,
  };
}

function normalizeServiceLinks(links) {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => ({
      serviceId: String(link?.serviceId || '').trim(),
      allocation: Math.min(100, Math.max(0, Number(link?.allocation) || 0)),
    }))
    .filter((link) => link.serviceId);
}

function normalizeVote(vote) {
  return {
    manual: normalizeEstimate(vote?.manual),
    ai: normalizeEstimate(vote?.ai),
    aiEnabled: vote?.aiEnabled === true || normalizeEstimate(vote?.ai) !== null,
  };
}

function normalizeRound(round, storyId) {
  const source = round && typeof round === 'object' ? round : {};
  const votes = source.votes && typeof source.votes === 'object'
    ? Object.fromEntries(Object.entries(source.votes).map(([id, vote]) => [id, normalizeVote(vote)]))
    : {};
  return {
    phase: ['idle', 'voting', 'revealed'].includes(source.phase) ? source.phase : 'idle',
    mode: source.mode === 'open' ? 'open' : 'hidden',
    storyId: source.storyId || storyId,
    roundNumber: Number.isInteger(source.roundNumber) && source.roundNumber > 0 ? source.roundNumber : 1,
    submittedCount: Number.isInteger(source.submittedCount) && source.submittedCount >= 0 ? source.submittedCount : 0,
    votes,
    cardFlipped: source.cardFlipped === true,
    revealedAt: source.revealedAt || null,
  };
}

function loadState(roomId = LOCAL_DEFAULT_ROOM_ID) {
  try {
    const storageKey = roomId === LOCAL_DEFAULT_ROOM_ID ? STORAGE_KEY : `${STORAGE_KEY}-${roomId}`;
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!saved || !Array.isArray(saved.stories)) return structuredClone(defaultState);

    const selectedStoryId = saved.selectedStoryId && saved.stories.some((story) => story.id === saved.selectedStoryId)
      ? saved.selectedStoryId
      : saved.stories[0]?.id || defaultState.selectedStoryId;
    const hasResourceModel = saved.resourceModelVersion === 1;

    return {
      resourceModelVersion: 1,
      sequence: sequences[saved.sequence] ? saved.sequence : defaultState.sequence,
      selectedStoryId,
      stories: saved.stories.map((story) => ({
        ...story,
        manual: normalizeEstimate(story.manual),
        ai: normalizeEstimate(story.ai),
        aiEnabled: story.aiEnabled ?? normalizeEstimate(story.ai) !== null,
        serviceLinks: Array.isArray(story.serviceLinks) && (hasResourceModel || story.serviceLinks.length)
          ? normalizeServiceLinks(story.serviceLinks)
          : structuredClone(initialStories.find((defaultStory) => defaultStory.id === story.id)?.serviceLinks || []),
      })),
      domains: Array.isArray(saved.domains)
        ? saved.domains.map((domain) => ({ id: String(domain.id), name: String(domain.name).trim() })).filter((domain) => domain.name)
        : structuredClone(defaultDomains),
      services: Array.isArray(saved.services)
        ? saved.services.map((service) => ({ id: String(service.id), name: String(service.name).trim(), domainId: service.domainId ? String(service.domainId) : '' })).filter((service) => service.name)
        : structuredClone(defaultServices),
      round: normalizeRound(saved.round, selectedStoryId),
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function normalizeEstimate(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function saveState() {
  siteRuntime.stateRevision += 1;
  persistLocalState();
  queueSiteCloudSync();
}

function persistLocalState() {
  const storageKey = activeRoomId === LOCAL_DEFAULT_ROOM_ID ? STORAGE_KEY : `${STORAGE_KEY}-${activeRoomId}`;
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function icon(name, className = '') {
  const icons = {
    board: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    users: '<path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3"/><path d="M16 11a3 3 0 1 0-1-5.8M16.5 15.1A3.5 3.5 0 0 1 20 18.5V20"/>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9h-.2a1.7 1.7 0 0 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2v-.2a1.7 1.7 0 0 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.2-1.2"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    sparkle: '<path d="m12 3-1.5 5.5L5 10l5.5 1.5L12 17l1.5-5.5L19 10l-5.5-1.5L12 3ZM19 16l-.7 2.3L16 19l2.3.7L19 22l.7-2.3L22 19l-2.3-.7L19 16Z"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.7-4L4 9"/><path d="M4 4v5h5M4 13a8 8 0 0 0 14.7 4L20 15"/><path d="M20 20v-5h-5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    note: '<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    upload: '<path d="M12 16V4m0 0 4 4m-4-4L8 8M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    eye: '<path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z"/><circle cx="12" cy="12" r="2"/>',
    flip: '<path d="M17 4h3v3M7 20H4v-3M20 7a8 8 0 0 0-14-2M4 17a8 8 0 0 0 14 2"/>',
    layers: '<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4"/>',
    cloud: '<path d="M7.5 18h9a4.5 4.5 0 0 0 .8-8.9A5.5 5.5 0 0 0 6.7 8.3 4 4 0 0 0 7.5 18Z"/>',
    play: '<path d="m8 5 11 7-11 7V5Z"/>',
  };

  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ''}</svg>`;
}

function getSelectedStory() {
  return state.stories.find((story) => story.id === state.selectedStoryId) || state.stories[0];
}

function formatScore(score) {
  if (score === null || score === undefined) return '—';
  return Number.isInteger(score) ? String(score) : score.toFixed(1).replace(/\.0$/, '');
}

function getConfiguredRoomId() {
  const urlRoomId = new URLSearchParams(window.location.search).get('room');
  const candidate = urlRoomId || localStorage.getItem(ROOM_ID_KEY) || '';
  return /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(candidate) ? candidate : null;
}

function getViewFromLocation() {
  const view = window.location.hash.replace(/^#/, '').trim().toLowerCase();
  return ['estimates', 'rooms', 'team', 'resources', 'settings'].includes(view) ? view : 'estimates';
}

function getCurrentRoom() {
  return cloud.room || cloud.rooms.find((room) => room.id === cloud.roomId) || localWorkspace.rooms.find((room) => room.id === cloud.roomId) || defaultWorkspace.rooms[0];
}

function getRoomName() {
  return getCurrentRoom()?.name || 'Planning room';
}

function getRoomPiLabel() {
  return getCurrentRoom()?.piLabel || 'Current increment';
}

function getUserName(user = cloud.user) {
  if (!user) return 'Jordan L.';
  return user.name || user.full_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Planner';
}

function getInitials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'PL';
}

function getRoundVotes() {
  return Object.entries(state.round.votes || {})
    .map(([id, vote]) => ({ id, ...normalizeVote(vote) }))
    .filter((vote) => vote.manual !== null || vote.ai !== null);
}

function getRoundVoteCount() {
  return Math.max(getRoundVotes().length, state.round.submittedCount || 0);
}

function getOwnVote() {
  return normalizeVote(state.round.votes?.[cloud.user?.id || participantId]);
}

function getService(serviceId) {
  return state.services.find((service) => service.id === serviceId);
}

function getDomain(domainId) {
  return state.domains.find((domain) => domain.id === domainId);
}

function getStoryAllocationTotal(story) {
  return normalizeServiceLinks(story.serviceLinks).reduce((total, link) => total + link.allocation, 0);
}

function getStoryContributions(story) {
  if (story.manual === null) return [];
  const links = normalizeServiceLinks(story.serviceLinks);
  const total = links.reduce((sum, link) => sum + link.allocation, 0);
  const denominator = total > 100 ? total : 100;
  const contributions = links.map((link) => ({
    serviceId: link.serviceId,
    points: story.manual * (link.allocation / denominator),
    percent: link.allocation / denominator * 100,
  }));
  const unassignedPercent = Math.max(0, 100 - total);
  if (unassignedPercent > 0 || !links.length) {
    contributions.push({ serviceId: null, points: story.manual * (unassignedPercent / 100 || 1), percent: unassignedPercent || 100 });
  }
  return contributions;
}

function getAllocationRows(kind) {
  const rows = new Map();
  const resources = kind === 'domain' ? state.domains : state.services;
  resources.forEach((resource) => rows.set(resource.id, { id: resource.id, name: resource.name, points: 0, stories: new Set() }));
  let totalPoints = 0;

  state.stories.forEach((story) => {
    if (story.manual === null) return;
    totalPoints += story.manual;
    getStoryContributions(story).forEach((contribution) => {
      const service = contribution.serviceId ? getService(contribution.serviceId) : null;
      const resourceId = kind === 'domain' ? service?.domainId || null : contribution.serviceId;
      const resource = resourceId ? rows.get(resourceId) : null;
      const target = resource || rows.get('__unassigned') || { id: '__unassigned', name: 'Unassigned', points: 0, stories: new Set() };
      if (!rows.has(target.id)) rows.set(target.id, target);
      target.points += contribution.points;
      if (contribution.points > 0) target.stories.add(story.id);
    });
  });

  const output = [...rows.values()]
    .map((row) => ({ ...row, storyCount: row.stories.size, percent: totalPoints ? row.points / totalPoints * 100 : 0 }))
    .filter((row) => row.points > 0 || row.id !== '__unassigned');
  return { rows: output, totalPoints };
}

function renderAuthAction() {
  if (cloud.user) {
    return `<button class="profile-button" type="button" data-auth-action="signout" title="Sign out ${escapeHTML(getUserName())}"><span class="avatar">${escapeHTML(getInitials(getUserName()))}</span><span class="profile-name">${escapeHTML(getUserName())}</span></button>`;
  }
  return siteRuntime.enabled
    ? `<a class="outline-button auth-button" href="/signin-with-chatgpt" data-auth-action="signin">${icon('users')}Sign in with ChatGPT</a>`
    : `<button class="outline-button auth-button" type="button" data-auth-action="signin">${icon('users')}Sign in with ChatGPT</button>`;
}

function renderCloudStatus() {
  if (cloud.status === 'synced') return `${icon('cloud')} Synced to cloud`;
  if (cloud.status === 'connecting') return `${icon('cloud')} Connecting…`;
  if (cloud.status === 'auth') return `${icon('users')} Sign in to sync your account`;
  if (cloud.status === 'error') return `${icon('info')} Cloud setup needed`;
  return `${icon('clock')} Local demo · browser saved`;
}

function renderStoryServices(story) {
  const links = normalizeServiceLinks(story.serviceLinks);
  const total = getStoryAllocationTotal(story);
  const available = state.services.filter((service) => !links.some((link) => link.serviceId === service.id));

  return `<div class="story-services">
    <div class="story-services-heading"><div><strong>Service allocation</strong><span>Manual points × allocation percentage</span></div><span class="allocation-total ${total === 100 ? 'complete' : ''}">${formatScore(total)}% assigned</span></div>
    ${links.length ? `<div class="service-link-list">${links.map((link) => {
      const service = getService(link.serviceId);
      const options = state.services.map((candidate) => `<option value="${escapeHTML(candidate.id)}" ${candidate.id === link.serviceId ? 'selected' : ''}>${escapeHTML(candidate.name)}${getDomain(candidate.domainId) ? ` · ${escapeHTML(getDomain(candidate.domainId).name)}` : ''}</option>`).join('');
      return `<div class="service-link-row"><select class="story-service-select" data-story-service="${escapeHTML(link.serviceId)}" aria-label="Service allocation">${service ? options : `<option value="${escapeHTML(link.serviceId)}" selected>Missing service</option>${options}`}</select><label class="allocation-input"><input type="number" min="0" max="100" step="5" value="${escapeHTML(link.allocation)}" data-service-allocation="${escapeHTML(link.serviceId)}" aria-label="Allocation percentage" /><span>%</span></label><button class="icon-button compact-icon" type="button" data-remove-service="${escapeHTML(link.serviceId)}" aria-label="Remove ${escapeHTML(service?.name || 'service')}">${icon('x')}</button></div>`;
    }).join('')}</div>` : '<p class="empty-allocation">No service linked yet. Add one to include this story in the breakdown.</p>'}
    ${available.length ? `<select class="add-service-select" data-add-service aria-label="Link a service"><option value="">Link a service…</option>${available.map((service) => `<option value="${escapeHTML(service.id)}">${escapeHTML(service.name)}${getDomain(service.domainId) ? ` · ${escapeHTML(getDomain(service.domainId).name)}` : ''}</option>`).join('')}</select>` : ''}
    ${links.length && total !== 100 ? `<p class="allocation-warning">Use 100% across linked services. Remaining points stay Unassigned.</p>` : ''}
  </div>`;
}

function renderBreakdownRows(kind) {
  const { rows, totalPoints } = getAllocationRows(kind);
  const maximum = Math.max(...rows.map((row) => row.points), 1);
  return `<div class="breakdown-total"><span>${formatScore(totalPoints)} estimated points</span><span>${state.stories.filter((story) => story.manual !== null).length}/${state.stories.length} stories scored</span></div><div class="breakdown-list">${rows.map((row) => `<div class="breakdown-row"><div class="breakdown-row-top"><strong>${escapeHTML(row.name)}</strong><span>${formatScore(row.points)} pts · ${Math.round(row.percent)}%</span></div><div class="breakdown-bar"><span style="width: ${Math.min(100, row.points / maximum * 100)}%"></span></div><div class="breakdown-row-foot">${row.storyCount} ${row.storyCount === 1 ? 'story' : 'stories'}</div></div>`).join('')}</div>`;
}

function renderVoteField(type, vote) {
  const isAI = type === 'ai';
  const disabled = isAI && vote.aiEnabled !== true;
  const active = disabled ? null : vote[type];
  const options = sequences[state.sequence].values.map((value) => `<button class="point-button ${active === value ? 'selected' : ''}" type="button" data-vote-type="${type}" data-vote-value="${value}" ${disabled ? 'disabled' : ''}>${formatScore(value)}</button>`).join('');
  return `<div class="vote-field ${isAI ? 'vote-ai-field' : ''} ${disabled ? 'is-disabled' : ''}"><div class="vote-field-label"><strong>${isAI ? `${icon('sparkle')}AI lens` : `${icon('users')}Your manual vote`}</strong>${isAI ? `<label class="toggle-wrap"><input type="checkbox" data-vote-ai-toggle ${disabled ? '' : 'checked'} /><span class="toggle"></span>${disabled ? 'Optional' : 'On'}</label>` : '<span class="vote-field-note">Hidden until reveal</span>'}</div><div class="point-options">${options}</div><label class="vote-custom-input"><span>Custom</span><input type="number" min="0" step="0.5" value="${active === null ? '' : escapeHTML(active)}" placeholder="—" data-vote-custom="${type}" aria-label="Custom ${isAI ? 'AI' : 'manual'} vote" ${disabled ? 'disabled' : ''} /></label></div>`;
}

function renderVoteResults(entries) {
  const manualVotes = entries.map((vote) => vote.manual).filter((value) => value !== null);
  const average = manualVotes.length ? manualVotes.reduce((sum, value) => sum + value, 0) / manualVotes.length : null;
  const minimum = manualVotes.length ? Math.min(...manualVotes) : null;
  const maximum = manualVotes.length ? Math.max(...manualVotes) : null;
  const spread = minimum === null ? null : maximum - minimum;
  return `<div class="vote-results"><div class="vote-results-summary"><div><span>Average</span><strong>${formatScore(average)}</strong></div><div><span>Range</span><strong>${formatScore(minimum)}–${formatScore(maximum)}</strong></div><div><span>Spread</span><strong>${formatScore(spread)}</strong></div></div><div class="vote-result-list">${entries.map((vote, index) => `<div class="vote-result-row"><span>${vote.id === (cloud.user?.id || participantId) ? 'You' : `Voter ${index + 1}`}</span><span class="score-pill manual">${formatScore(vote.manual)}</span><span class="score-pill ai">${formatScore(vote.ai)}</span></div>`).join('')}</div><p class="vote-result-note">Use the final estimate fields above to record the agreed team value. AI votes are shown only as a comparison.</p></div>`;
}

function renderVotePanel(story) {
  const round = state.round;
  const entries = getRoundVotes();
  const ownVote = getOwnVote();
  const visibleEntries = round.mode === 'open' || round.phase === 'revealed' ? entries : [];
  const modeButtons = `<div class="vote-mode-control" role="group" aria-label="Voting visibility"><button class="mode-button ${round.mode === 'hidden' ? 'active' : ''}" type="button" data-vote-mode="hidden">${icon('lock')}Hidden</button><button class="mode-button ${round.mode === 'open' ? 'active' : ''}" type="button" data-vote-mode="open">${icon('eye')}Open</button></div>`;

  if (round.phase === 'idle') {
    return `<section class="vote-panel"><div class="vote-panel-heading"><div><p class="section-kicker">Team round</p><h3>Estimate without anchoring</h3><p>Start a round so everyone can choose a card at the same time. Hidden mode keeps values private until reveal.</p></div>${modeButtons}</div><div class="vote-panel-footer"><span class="vote-status">${icon(round.mode === 'hidden' ? 'lock' : 'eye')} ${round.mode === 'hidden' ? 'Votes stay face down until reveal' : 'Votes are visible as they arrive'}</span><button class="primary-button" type="button" data-start-voting>${icon('play')}Start ${round.mode === 'hidden' ? 'hidden' : 'open'} round</button></div></section>`;
  }

  const isRevealed = round.phase === 'revealed';
  const voteCount = getRoundVoteCount();
  const canReveal = ownVote.manual !== null;
  const voteStatus = isRevealed
    ? `${icon('check')} Votes revealed · ${voteCount} ${voteCount === 1 ? 'vote' : 'votes'}`
    : `${icon(round.mode === 'hidden' ? 'lock' : 'eye')} ${voteCount} ${voteCount === 1 ? 'vote' : 'votes'} in · ${round.mode === 'hidden' ? 'values hidden' : 'live results'}`;
  return `<section class="vote-panel ${isRevealed ? 'is-revealed' : ''}"><div class="vote-panel-heading"><div><p class="section-kicker">${isRevealed ? 'Round result' : 'Voting in progress'}</p><h3>${isRevealed ? 'Compare the room' : 'Choose your card'}</h3><p>${isRevealed ? 'The room can now compare perspectives and agree a final estimate.' : 'Flip your card, choose a manual value, and optionally add an AI second opinion.'}</p></div>${modeButtons}</div>${isRevealed ? renderVoteResults(entries) : `<div class="vote-card ${round.cardFlipped ? 'is-flipped' : ''}" data-vote-card><div class="vote-card-inner"><div class="vote-card-face vote-card-front"><span class="vote-card-lock">${icon(round.mode === 'hidden' ? 'lock' : 'eye')}</span><strong>${round.mode === 'hidden' ? 'Your vote is private' : 'Open voting'}</strong><span>${round.mode === 'hidden' ? 'Flip the card when you are ready to vote.' : 'Choose a value and the room can see it.'}</span></div><div class="vote-card-face vote-card-back"><div class="vote-fields">${renderVoteField('manual', ownVote)}${renderVoteField('ai', ownVote)}</div></div></div></div>`}<div class="vote-panel-footer"><span class="vote-status">${voteStatus}</span><div class="vote-actions">${!isRevealed ? `<button class="outline-button" type="button" data-flip-card aria-pressed="${round.cardFlipped}">${icon('flip')}Flip card</button>` : ''}${!isRevealed ? `<button class="primary-button" type="button" data-reveal-votes ${canReveal ? '' : 'disabled'}>${icon('eye')}Reveal votes</button>` : ''}<button class="outline-button" type="button" data-clear-votes>${icon('refresh')}Clear votes</button>${isRevealed ? '<button class="outline-button" type="button" data-reset-round>New round</button>' : ''}</div></div>${visibleEntries.length && !isRevealed ? renderVoteResults(visibleEntries) : ''}</section>`;
}

function renderAllocationCard() {
  return `<section class="card allocation-card" id="allocation-card"><div class="lower-card-heading"><div><h2>Resource allocation</h2><p>Manual story points mapped to the services doing the work.</p></div><button class="outline-button" type="button" data-manage-services>${icon('layers')}Manage services</button></div><div class="allocation-tabs" role="tablist" aria-label="Allocation breakdown"><button class="allocation-tab active" type="button" data-breakdown="service" role="tab" aria-selected="true">By service</button><button class="allocation-tab" type="button" data-breakdown="domain" role="tab" aria-selected="false">By domain</button></div><div class="allocation-breakdown" data-breakdown-panel="service">${renderBreakdownRows('service')}</div><div class="allocation-breakdown" data-breakdown-panel="domain" hidden>${renderBreakdownRows('domain')}</div><p class="allocation-note">Only saved manual estimates count. Unestimated work is excluded until it has a team value; incomplete service links leave the remainder Unassigned.</p></section>`;
}

function renderSidebar(view = activeView) {
  const room = getCurrentRoom();
  const roomCount = cloud.rooms.length || 1;
  return `<aside class="sidebar">
    <div class="brand"><span class="brand-mark">P</span><span class="brand-text">pointline</span></div>
    <p class="sidebar-kicker">Planning workspace</p>
    <button class="room-selector" type="button" data-nav="rooms" aria-label="Open rooms">
      <span class="room-dot"></span>
      <span class="room-selector-copy"><strong>${escapeHTML(room.name)}</strong><span>${escapeHTML(room.piLabel)} · ${cloud.status === 'local' ? 'Local room' : 'Shared room'}</span></span>
      ${icon('chevronDown')}
    </button>

    <nav class="sidebar-nav" aria-label="Workspace navigation">
      <button class="nav-link ${view === 'estimates' ? 'active' : ''}" type="button" data-nav="estimates">${icon('board')}<span class="nav-link-label">Estimates</span><span class="nav-count">${state.stories.filter((story) => story.manual !== null).length}/${state.stories.length}</span></button>
      <button class="nav-link ${view === 'team' ? 'active' : ''}" type="button" data-nav="team">${icon('users')}<span class="nav-link-label">Team</span><span class="nav-count">${cloud.memberCount}</span></button>
      <button class="nav-link ${view === 'rooms' ? 'active' : ''}" type="button" data-nav="rooms">${icon('layers')}<span class="nav-link-label">Rooms</span><span class="nav-count">${roomCount}</span></button>
      <button class="nav-link ${view === 'settings' ? 'active' : ''}" type="button" data-nav="settings">${icon('settings')}<span class="nav-link-label">Room settings</span></button>
    </nav>

    <div class="sidebar-spacer"></div>
    <div class="sidebar-tip">
      <span class="sidebar-tip-icon">✦</span>
      <strong>One story. One shared decision.</strong>
      <p>Everyone can vote on the same active story while the room stays focused.</p>
    </div>
    <div class="sidebar-user">
      <span class="avatar">${escapeHTML(getInitials(getUserName()))}</span>
      <span class="sidebar-user-copy"><strong>${escapeHTML(getUserName())}</strong><span>${cloud.user ? 'Cloud participant' : 'Local facilitator'}</span></span>
    </div>
  </aside>`;
}

function renderTopbar(view = activeView) {
  const labels = { estimates: 'Estimates', team: 'Team', rooms: 'Rooms', resources: 'Resources', settings: 'Room settings' };
  return `<header class="topbar">
    <div class="breadcrumbs"><span>Workspace</span>${icon('chevron')}<span>${escapeHTML(getRoomName())}</span>${icon('chevron')}<span>${labels[view]}</span></div>
    <div class="topbar-actions">
      <button class="icon-button" type="button" data-notifications aria-label="Notifications">${icon('bell')}</button>
      <button class="outline-button" type="button" data-share>${icon('share')}Invite</button>
      ${renderAuthAction()}
    </div>
  </header>`;
}

function renderRoomsPage() {
  return `<section class="page-intro">
    <div><p class="eyebrow">Workspace · rooms</p><h1>Choose where the planning happens.</h1><p class="page-intro-copy">Keep each increment focused. Create a room for a planning session, then invite the people or team who should estimate together.</p></div>
    <button class="primary-button" type="button" data-create-room>${icon('plus')}New room</button>
  </section>
  <section class="management-section">
    <div class="section-heading"><div><p class="section-kicker">Your rooms</p><h2>Planning rooms</h2></div><span class="section-count">${cloud.rooms.length} ${cloud.rooms.length === 1 ? 'room' : 'rooms'}</span></div>
    <div class="room-directory">${cloud.rooms.length ? cloud.rooms.map((room) => `<article class="room-card ${room.id === cloud.roomId ? 'is-current' : ''}"><div class="room-card-top"><span class="room-status-dot"></span><span>${room.id === cloud.roomId ? 'Current room' : 'Available room'}</span></div><h3>${escapeHTML(room.name)}</h3><p>${escapeHTML(room.piLabel)} · ${Math.max(1, Number(room.memberCount) || 1)} ${Number(room.memberCount) === 1 ? 'person' : 'people'}</p><div class="room-card-footer"><span>${room.role === 'owner' ? 'Owner' : 'Member'}</span><button class="outline-button" type="button" data-open-room="${escapeHTML(room.id)}">${room.id === cloud.roomId ? 'Open room' : 'Switch room'}${icon('chevron')}</button></div></article>`).join('') : '<div class="empty-state"><span class="empty-state-icon">+</span><h3>No rooms yet</h3><p>Create a room to start a focused planning session.</p></div>'}</div>
  </section>`;
}

function getSelectedTeam() {
  return cloud.teams.find((team) => team.id === cloud.selectedTeamId) || cloud.teams[0] || null;
}

function renderTeamPage() {
  const selectedTeam = getSelectedTeam();
  return `<section class="page-intro">
    <div><p class="eyebrow">Workspace · team</p><h1>Build your planning teams.</h1><p class="page-intro-copy">Keep people reusable across rooms. Add teammates once, then invite the whole team into the room that needs them.</p></div>
    <button class="primary-button" type="button" data-create-team>${icon('plus')}New team</button>
  </section>
  <div class="team-layout">
    <section class="card team-directory-card"><div class="section-heading"><div><p class="section-kicker">Teams</p><h2>Your teams</h2></div><span class="section-count">${cloud.teams.length}</span></div><div class="team-list">${cloud.teams.length ? cloud.teams.map((team) => `<button class="team-list-row ${team.id === selectedTeam?.id ? 'active' : ''}" type="button" data-select-team="${escapeHTML(team.id)}"><span class="team-avatar">${escapeHTML(getInitials(team.name))}</span><span><strong>${escapeHTML(team.name)}</strong><small>${team.members?.length || team.memberCount || 0} ${(team.members?.length || team.memberCount || 0) === 1 ? 'person' : 'people'}</small></span>${icon('chevron')}</button>`).join('') : '<div class="empty-state compact"><h3>No teams yet</h3><p>Create one to reuse a group of people across rooms.</p></div>'}</div></section>
    <section class="card team-detail-card">${selectedTeam ? `<div class="team-detail-header"><div><p class="section-kicker">Team roster</p><h2>${escapeHTML(selectedTeam.name)}</h2><p>Invite this team to <strong>${escapeHTML(getRoomName())}</strong> or share a link for people to join the team.</p></div><span class="team-detail-badge">${selectedTeam.role === 'owner' ? 'Owner' : 'Member'}</span></div><div class="team-actions"><button class="primary-button" type="button" data-invite-team-to-room="${escapeHTML(selectedTeam.id)}">${icon('share')}Invite team to room</button><button class="outline-button" type="button" data-invite-team="${escapeHTML(selectedTeam.id)}">${icon('link')}Add people with a link</button></div><div class="member-list"><div class="member-list-heading"><strong>People</strong><span>${selectedTeam.members?.length || selectedTeam.memberCount || 0} members</span></div>${(selectedTeam.members || []).map((member) => `<div class="member-row"><span class="avatar small-avatar">${escapeHTML(getInitials(member.name))}</span><span><strong>${escapeHTML(member.name)}</strong><small>${escapeHTML(member.email || (member.role === 'owner' ? 'Team owner' : 'Team member'))}</small></span><span class="member-role">${member.role === 'owner' ? 'Owner' : 'Member'}</span></div>`).join('') || '<p class="empty-manager">No members yet. Share the team link to add the first person.</p>'}</div>` : '<div class="empty-state"><span class="empty-state-icon">+</span><h3>Create your first team</h3><p>Teams make it easy to invite the same people into several planning rooms.</p></div>'}</section>
  </div>`;
}

function renderSettingsPage() {
  const room = getCurrentRoom();
  return `<section class="page-intro">
    <div><p class="eyebrow">Workspace · room settings</p><h1>${escapeHTML(room.name)}</h1><p class="page-intro-copy">Tune the room vocabulary and share access without leaving the planning workspace.</p></div>
    <button class="outline-button" type="button" data-share>${icon('share')}Invite people</button>
  </section>
  <section class="settings-layout">
    <section class="card settings-card"><div class="section-heading"><div><p class="section-kicker">Room identity</p><h2>Room details</h2></div></div><div class="settings-detail-list"><div><span>Name</span><strong>${escapeHTML(room.name)}</strong></div><div><span>Increment</span><strong>${escapeHTML(room.piLabel)}</strong></div><div><span>People with access</span><strong>${cloud.memberCount}</strong></div><div><span>Your role</span><strong>${room.role === 'owner' ? 'Room owner' : 'Team member'}</strong></div></div></section>
    <section class="card settings-card"><div class="section-heading"><div><p class="section-kicker">Estimation rules</p><h2>Point sequence</h2></div></div><p class="settings-copy">Everyone sees the same card values when a round starts. Existing estimates stay attached to their stories.</p><label class="sequence-control settings-sequence">Point sequence<select id="settings-sequence-select" aria-label="Point sequence">${Object.entries(sequences).map(([key, sequence]) => `<option value="${key}" ${key === state.sequence ? 'selected' : ''}>${sequence.label}</option>`).join('')}</select></label><div class="guide-points settings-points">${sequences[state.sequence].values.map((value) => `<span class="guide-point">${formatScore(value)}</span>`).join('')}</div></section>
  </section>`;
}

function renderManagementPage() {
  const content = activeView === 'rooms'
    ? renderRoomsPage()
    : activeView === 'team'
      ? renderTeamPage()
      : activeView === 'resources'
        ? `<section class="page-intro"><div><p class="eyebrow">Workspace · resources</p><h1>See where the work lands.</h1><p class="page-intro-copy">Use the same saved story estimates to understand service and domain allocation.</p></div></section>${renderAllocationCard()}`
        : renderSettingsPage();

  document.querySelector('#app').innerHTML = `${renderSidebar(activeView)}<main class="main-area">${renderTopbar(activeView)}<div class="main-content management-content">${content}</div></main>`;
  bindEvents();
}

function render() {
  if (activeView !== 'estimates') {
    renderManagementPage();
    return;
  }
  const selectedStory = getSelectedStory();
  const estimatedCount = state.stories.filter((story) => story.manual !== null).length;
  const aiCount = state.stories.filter((story) => story.ai !== null).length;
  const pairedStories = state.stories.filter((story) => story.manual !== null && story.ai !== null);
  const agreementCount = pairedStories.filter((story) => story.manual === story.ai).length;
  const agreement = pairedStories.length ? Math.round((agreementCount / pairedStories.length) * 100) : 0;
  const manualScores = state.stories.map((story) => story.manual).filter((score) => score !== null);
  const manualAverage = manualScores.length
    ? (manualScores.reduce((total, score) => total + score, 0) / manualScores.length).toFixed(1)
    : '—';
  const storyIndex = Math.max(0, state.stories.findIndex((story) => story.id === selectedStory.id));
  const progress = Math.round((estimatedCount / state.stories.length) * 100);

  document.querySelector('#app').innerHTML = `
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">P</span><span class="brand-text">pointline</span></div>
      <p class="sidebar-kicker">Planning workspace</p>
      <button class="room-selector" type="button" data-nav="rooms" aria-label="Open rooms">
        <span class="room-dot"></span>
        <span class="room-selector-copy"><strong>${escapeHTML(getRoomName())}</strong><span>${escapeHTML(getRoomPiLabel())} · ${cloud.status === 'local' ? 'Local room' : 'Shared room'}</span></span>
        ${icon('chevronDown')}
      </button>

      <nav class="sidebar-nav" aria-label="Workspace navigation">
        <button class="nav-link active" type="button" data-nav="estimates">${icon('board')}<span class="nav-link-label">Estimates</span><span class="nav-count">${estimatedCount}/${state.stories.length}</span></button>
        <button class="nav-link" type="button" data-nav="team">${icon('users')}<span class="nav-link-label">Team</span><span class="nav-count">${cloud.memberCount}</span></button>
        <button class="nav-link" type="button" data-nav="resources">${icon('layers')}<span class="nav-link-label">Resources</span><span class="nav-count">${state.services.length}</span></button>
        <button class="nav-link" type="button" data-nav="settings">${icon('settings')}<span class="nav-link-label">Room settings</span></button>
      </nav>

      <div class="sidebar-spacer"></div>
      <div class="sidebar-tip">
        <span class="sidebar-tip-icon">✦</span>
        <strong>One story. One shared decision.</strong>
        <p>Everyone can vote on the same active story while the room stays focused.</p>
      </div>
      <div class="sidebar-user">
        <span class="avatar">${escapeHTML(getInitials(getUserName()))}</span>
        <span class="sidebar-user-copy"><strong>${escapeHTML(getUserName())}</strong><span>${cloud.user ? 'Cloud participant' : 'Local facilitator'}</span></span>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <div class="breadcrumbs"><span>Workspace</span>${icon('chevron')}<span>${escapeHTML(getRoomName())}</span>${icon('chevron')}<span>Estimates</span></div>
        <div class="topbar-actions">
          <button class="icon-button" type="button" data-notifications aria-label="Notifications">${icon('bell')}</button>
          <button class="outline-button" type="button" data-share>${icon('share')}Invite</button>
          ${renderAuthAction()}
        </div>
      </header>

      <div class="main-content">
        <section class="hero-row">
          <div>
            <p class="eyebrow">PI planning · estimation room</p>
            <h1>Estimate the work,<br />then compare the lens.</h1>
            <p class="hero-copy">Give every story a team-owned estimate, map the work to the services delivering it, and compare an optional AI-assisted second opinion without anchoring the room.</p>
          </div>
          <div class="pi-meta"><span class="pi-meta-icon">PI</span><span class="pi-meta-copy"><span>Current increment</span><strong>${escapeHTML(getRoomPiLabel())} · ${escapeHTML(getRoomName())}</strong><small class="cloud-status">${renderCloudStatus()}</small></span></div>
        </section>

        <section class="summary-grid" aria-label="Room summary">
          <article class="summary-card">
            <div class="summary-top"><span class="summary-label">Stories estimated</span><span class="summary-icon">${icon('board')}</span></div>
            <div class="summary-value">${estimatedCount}<small>/ ${state.stories.length}</small></div>
            <div class="progress-bar" aria-label="${progress}% estimated"><span style="width: ${progress}%"></span></div>
          </article>
          <article class="summary-card">
            <div class="summary-top"><span class="summary-label">Manual average</span><span class="summary-icon">${icon('check')}</span></div>
            <div class="summary-value">${manualAverage}<small>pts</small></div>
            <div class="summary-foot">Team estimate across scored stories</div>
          </article>
          <article class="summary-card">
            <div class="summary-top"><span class="summary-label">AI second opinions</span><span class="summary-icon">${icon('sparkle')}</span></div>
            <div class="summary-value">${aiCount}<small>added</small></div>
            <div class="summary-foot">Optional — never blocks a save</div>
          </article>
          <article class="summary-card">
            <div class="summary-top"><span class="summary-label">Agreement</span><span class="summary-icon">${icon('users')}</span></div>
            <div class="summary-value">${agreement}<small>%</small></div>
            <div class="summary-foot ${agreement >= 60 ? 'positive' : ''}">${pairedStories.length ? `${agreementCount} of ${pairedStories.length} pairs aligned` : 'Add paired estimates to compare'}</div>
          </article>
        </section>

        <div class="workspace-grid">
          <section class="card estimator-card" aria-label="Story estimator">
            <div class="card-heading">
              <div><p class="story-progress">Story ${String(storyIndex + 1).padStart(2, '0')} of ${String(state.stories.length).padStart(2, '0')}</p><h2>Current story</h2></div>
              <label class="sequence-control">Point sequence<select id="sequence-select" aria-label="Point sequence">${Object.entries(sequences).map(([key, sequence]) => `<option value="${key}" ${key === state.sequence ? 'selected' : ''}>${sequence.label}</option>`).join('')}</select></label>
            </div>

            <article class="story-detail">
              <span class="story-type">${escapeHTML(selectedStory.type)}</span>
              <h3>${escapeHTML(selectedStory.title)}</h3>
              <p class="story-description">${escapeHTML(selectedStory.description)}</p>
              <div class="acceptance-list">${selectedStory.acceptance.map((item) => `<span class="acceptance-chip">${icon('check')}${escapeHTML(item)}</span>`).join('')}</div>
              ${renderStoryServices(selectedStory)}
            </article>

            ${renderVotePanel(selectedStory)}

            <section class="estimate-section">
              <div class="estimate-section-heading"><h3>Record the final perspectives</h3><p>${sequences[state.sequence].helper} · select or enter a custom value</p></div>
              <div class="estimate-fields">
                ${renderEstimateField('manual', selectedStory)}
                ${renderEstimateField('ai', selectedStory)}
              </div>
            </section>

            <div class="estimator-footer">
              <div class="status-message">${selectedStory.saved ? `${icon('check')} Saved to the room` : `${icon('clock')} Not estimated yet`}</div>
              <div class="footer-actions"><button class="outline-button" type="button" data-reset>${icon('refresh')}Clear</button><button class="primary-button" type="button" data-save-next>Save &amp; next ${icon('chevron')}</button></div>
            </div>
          </section>

          <aside class="card queue-card" aria-label="Story queue">
            <div class="queue-header"><div><h2>Story queue</h2><p>Pick a story to estimate</p></div><div class="queue-header-actions"><button class="outline-button import-button" type="button" data-import-stories="true" onclick="openImportModal()">${icon('upload')}Import</button><button class="icon-button" type="button" data-new-story aria-label="Add a new story">${icon('plus')}</button></div></div>
            <div class="story-list">${state.stories.map((story, index) => renderStoryRow(story, index)).join('')}</div>
            <div class="queue-footer">${icon('clock')} ${state.stories.length - estimatedCount} stories still need a team estimate</div>
          </aside>
        </div>

        <div class="lower-grid">
          <section class="card history-card">
            <div class="lower-card-heading"><h2>Estimate history</h2><span>Manual vs AI-assisted</span></div>
            <table class="history-table"><thead><tr><th>Story</th><th>Manual</th><th>AI</th><th>Difference</th></tr></thead><tbody>${renderHistoryRows()}</tbody></table>
          </section>
          <section class="card guide-card">
            <div class="lower-card-heading"><h2>${sequences[state.sequence].label} deck</h2><span>Room setting</span></div>
            <p class="guide-copy">The point sequence applies to both fields. Keep the manual estimate as the team’s source of truth; the second field is a comparison only.</p>
            <div class="guide-points">${sequences[state.sequence].values.map((value) => `<span class="guide-point">${formatScore(value)}</span>`).join('')}</div>
            <div class="guide-note">${icon('info')} You can switch sequences at any time. Existing values stay attached to their stories.</div>
          </section>
        </div>

        ${renderAllocationCard()}
      </div>
    </main>
  `;

  bindEvents();
}

function renderEstimateField(type, story) {
  const isAI = type === 'ai';
  const score = story[type];
  const sequenceValues = sequences[state.sequence].values;
  const disabled = isAI && story.aiEnabled !== true;
  const active = disabled ? null : score;

  return `<div class="estimate-field ${isAI ? 'ai-field' : ''} ${disabled ? 'is-disabled' : ''}">
    <div class="field-label-row">
      <div class="field-label-copy">${icon(isAI ? 'sparkle' : 'users')}<strong>${isAI ? 'AI-assisted estimate' : 'Your estimate'}</strong></div>
      ${isAI ? `<label class="toggle-wrap"><input type="checkbox" data-ai-toggle ${!disabled ? 'checked' : ''} /><span class="toggle"></span>${disabled ? 'Add optional' : 'Optional on'}</label>` : '<span class="story-type">team-owned</span>'}
    </div>
    <p class="field-helper">${isAI ? (disabled ? 'Turn this on when you want to record a second opinion for the same story.' : 'Enter the point value from your AI-assisted read of this story.') : 'The team’s shared point of view. This is the estimate that drives planning.'}</p>
    <div class="point-options" aria-label="${isAI ? 'AI-assisted' : 'Manual'} point options">${sequenceValues.map((value) => `<button class="point-button ${active === value ? 'selected' : ''}" type="button" data-estimate-type="${type}" data-estimate-value="${value}" ${disabled ? 'disabled' : ''}>${formatScore(value)}</button>`).join('')}</div>
    <div class="field-bottom-row"><span class="custom-label">Custom value</span><input class="field-input" type="number" min="0" step="0.5" value="${active === null ? '' : escapeHTML(active)}" placeholder="—" data-custom-type="${type}" aria-label="Custom ${isAI ? 'AI-assisted' : 'manual'} estimate" ${disabled ? 'disabled' : ''} /></div>
  </div>`;
}

function renderStoryRow(story, index) {
  const status = story.manual !== null ? 'Estimated' : 'Needs estimate';
  return `<button class="story-row ${story.id === state.selectedStoryId ? 'active' : ''}" type="button" data-story-id="${escapeHTML(story.id)}">
    <span class="story-number">${String(index + 1).padStart(2, '0')}</span>
    <span class="story-row-copy"><strong>${escapeHTML(story.title)}</strong><span>${escapeHTML(story.id)} · ${status}</span></span>
    <span class="story-score"><span class="score-pill ${story.manual === null ? 'empty' : 'manual'}">${formatScore(story.manual)}</span><span class="score-pill ${story.ai === null ? 'empty' : 'ai'}">${formatScore(story.ai)}</span></span>
  </button>`;
}

function renderHistoryRows() {
  const rows = state.stories.filter((story) => story.manual !== null || story.ai !== null).slice(0, 5);
  if (!rows.length) return '<tr><td colspan="4" class="table-score muted">No estimates recorded yet.</td></tr>';

  return rows.map((story) => {
    const difference = story.manual !== null && story.ai !== null ? Math.abs(story.manual - story.ai) : null;
    return `<tr><td class="history-story" title="${escapeHTML(story.title)}">${escapeHTML(story.title)}</td><td class="table-score">${formatScore(story.manual)}</td><td class="table-score ${story.ai === null ? 'muted' : ''}">${formatScore(story.ai)}</td><td>${difference === 0 ? `<span class="agreement">${icon('check')}Aligned</span>` : difference === null ? '<span class="table-score muted">—</span>' : `<span class="table-score">${formatScore(difference)} pts apart</span>`}</td></tr>`;
  }).join('');
}

function parseTextList(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, ''))
    .filter(Boolean)
    .map((line) => {
      const [title, description, type, acceptance] = line.split('|').map((part) => part.trim());
      return normalizeImportedStory({ title, description, type, acceptance });
    })
    .filter(Boolean);
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && nextCharacter === '\n') index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

function normalizeHeader(header) {
  return header.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function parseCSVList(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];

  const headerNames = rows[0].map(normalizeHeader);
  const supportedHeaders = new Set(['id', 'title', 'story', 'summary', 'description', 'type', 'acceptance', 'acceptancecriteria']);
  const hasHeader = headerNames.some((header) => supportedHeaders.has(header));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const indexOf = (...names) => headerNames.findIndex((header) => names.includes(header));
  const titleIndex = hasHeader ? indexOf('title', 'story', 'summary') : 0;
  const descriptionIndex = hasHeader ? indexOf('description', 'summary') : 1;
  const typeIndex = hasHeader ? indexOf('type') : 2;
  const acceptanceIndex = hasHeader ? indexOf('acceptance', 'acceptancecriteria') : 3;
  const idIndex = hasHeader ? indexOf('id') : 4;

  return dataRows
    .map((row) => normalizeImportedStory({
      id: idIndex >= 0 ? row[idIndex] : '',
      title: titleIndex >= 0 ? row[titleIndex] : row[0],
      description: descriptionIndex >= 0 ? row[descriptionIndex] : '',
      type: typeIndex >= 0 ? row[typeIndex] : '',
      acceptance: acceptanceIndex >= 0 ? row[acceptanceIndex] : '',
    }))
    .filter(Boolean);
}

function normalizeImportedStory({ id = '', title = '', description = '', type = '', acceptance = '' }) {
  const cleanTitle = String(title).trim();
  if (!cleanTitle) return null;

  const acceptanceItems = String(acceptance)
    .split(/[;\n|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);

  return {
    id: String(id).trim(),
    type: String(type).trim() || 'Feature',
    title: cleanTitle,
    description: String(description).trim() || 'A new story ready for the team to shape and estimate together.',
    acceptance: acceptanceItems.length ? acceptanceItems : ['Ready for discussion'],
    manual: null,
    ai: null,
    aiEnabled: false,
    saved: false,
    serviceLinks: [],
  };
}

function parseImportDraft() {
  if (!importDraft.text.trim()) return [];
  return importDraft.mode === 'file' && /\.csv$/i.test(importDraft.fileName)
    ? parseCSVList(importDraft.text)
    : parseTextList(importDraft.text);
}

function updateImportPreview() {
  const stories = parseImportDraft();
  const count = document.querySelector('[data-import-count]');
  const list = document.querySelector('[data-import-preview-list]');
  const submit = document.querySelector('[data-import-submit]');
  if (!count || !list || !submit) return;

  count.textContent = stories.length ? `${stories.length} ready` : 'No stories yet';
  count.classList.toggle('empty', stories.length === 0);
  list.innerHTML = stories.length
    ? `${stories.slice(0, 4).map((story) => `<li>${escapeHTML(story.title)}</li>`).join('')}${stories.length > 4 ? `<li class="more">+ ${stories.length - 4} more</li>` : ''}`
    : '<li class="more">Add a line or choose a file to preview stories.</li>';
  submit.disabled = stories.length === 0;
}

function getNextStoryNumber() {
  const numbers = state.stories
    .map((story) => Number(String(story.id).match(/(\d+)$/)?.[1] || 0))
    .filter((number) => Number.isFinite(number));
  return Math.max(103, ...numbers) + 1;
}

function addImportedStories(stories) {
  const existingIds = new Set(state.stories.map((story) => story.id));
  let nextStoryNumber = getNextStoryNumber();
  const imported = stories.map((story) => {
    let id = story.id;
    while (!id || existingIds.has(id)) {
      id = `PL-${nextStoryNumber}`;
      nextStoryNumber += 1;
    }
    existingIds.add(id);
    return { ...story, id };
  });

  state.stories.push(...imported);
  state.selectedStoryId = imported[0].id;
  saveState();
  closeModal();
  render();
  showToast(`${imported.length} ${imported.length === 1 ? 'story' : 'stories'} added to the queue`);
}

function bindEvents() {
  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => navigateToView(button.dataset.nav));
  });

  document.querySelectorAll('[data-open-room]').forEach((button) => {
    button.addEventListener('click', () => selectRoom(button.dataset.openRoom));
  });
  document.querySelector('[data-create-room]')?.addEventListener('click', openCreateRoomModal);
  document.querySelector('[data-create-team]')?.addEventListener('click', openCreateTeamModal);
  document.querySelectorAll('[data-select-team]').forEach((button) => {
    button.addEventListener('click', () => {
      cloud.selectedTeamId = button.dataset.selectTeam;
      render();
    });
  });
  document.querySelectorAll('[data-invite-team]').forEach((button) => {
    button.addEventListener('click', () => openInviteLink(button.dataset.inviteTeam, 'team'));
  });
  document.querySelectorAll('[data-invite-team-to-room]').forEach((button) => {
    button.addEventListener('click', () => openInviteLink(button.dataset.inviteTeamToRoom, 'room-team'));
  });

  document.querySelector('#sequence-select')?.addEventListener('change', (event) => {
    state.sequence = event.target.value;
    saveState();
    render();
    showToast(`${sequences[state.sequence].label} sequence applied to the room`);
  });

  document.querySelectorAll('[data-story-id]').forEach((button) => {
    button.addEventListener('click', () => selectStory(button.dataset.storyId));
  });

  document.querySelectorAll('[data-estimate-type]').forEach((button) => {
    button.addEventListener('click', () => {
      const story = getSelectedStory();
      const type = button.dataset.estimateType;
      story[type] = normalizeEstimate(button.dataset.estimateValue);
      story.saved = false;
      if (type === 'ai') story.aiEnabled = true;
      saveState();
      render();
    });
  });

  document.querySelectorAll('[data-custom-type]').forEach((input) => {
    input.addEventListener('change', () => updateCustomEstimate(input));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        updateCustomEstimate(input);
      }
    });
  });

  const aiToggle = document.querySelector('[data-ai-toggle]');
  if (aiToggle) {
    aiToggle.addEventListener('change', () => {
      const story = getSelectedStory();
      story.aiEnabled = aiToggle.checked;
      if (!aiToggle.checked) story.ai = null;
      saveState();
      render();
    });
  }

  document.querySelector('[data-reset]')?.addEventListener('click', () => {
    const story = getSelectedStory();
    story.manual = null;
    story.ai = null;
    story.aiEnabled = false;
    story.saved = false;
    saveState();
    render();
    showToast('Final estimates cleared for this story');
  });

  document.querySelector('[data-save-next]')?.addEventListener('click', saveAndNext);
  document.querySelector('[data-new-story]')?.addEventListener('click', openNewStoryModal);
  document.querySelector('[data-import-stories]')?.addEventListener('click', openImportModal);
  document.querySelector('[data-share]')?.addEventListener('click', shareRoom);
  document.querySelector('[data-settings-sequence-select]')?.addEventListener('change', (event) => {
    state.sequence = event.target.value;
    saveState();
    render();
    showToast(`${sequences[state.sequence].label} sequence applied to the room`);
  });
  document.querySelector('[data-notifications]')?.addEventListener('click', () => showToast('You’re all caught up'));
  document.querySelectorAll('[data-manage-services]').forEach((button) => button.addEventListener('click', openServicesModal));

  document.querySelectorAll('[data-vote-mode]').forEach((button) => {
    button.addEventListener('click', () => setVoteMode(button.dataset.voteMode));
  });
  document.querySelector('[data-start-voting]')?.addEventListener('click', startVoting);
  document.querySelector('[data-flip-card]')?.addEventListener('click', flipVoteCard);
  document.querySelector('[data-reveal-votes]')?.addEventListener('click', revealVotes);
  document.querySelector('[data-clear-votes]')?.addEventListener('click', clearVotes);
  document.querySelector('[data-reset-round]')?.addEventListener('click', resetRound);

  document.querySelectorAll('[data-vote-type]').forEach((button) => {
    button.addEventListener('click', () => updateVote(button.dataset.voteType, button.dataset.voteValue));
  });
  document.querySelectorAll('[data-vote-custom]').forEach((input) => {
    input.addEventListener('change', () => updateCustomVote(input));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        updateCustomVote(input);
      }
    });
  });
  document.querySelector('[data-vote-ai-toggle]')?.addEventListener('change', (event) => {
    const vote = getOwnVote();
    vote.aiEnabled = event.target.checked;
    if (!vote.aiEnabled) vote.ai = null;
    state.round.votes[cloud.user?.id || participantId] = vote;
    saveState();
    syncSiteVote();
    render();
  });

  document.querySelector('[data-add-service]')?.addEventListener('change', (event) => addServiceToStory(event.target.value));
  document.querySelectorAll('[data-story-service]').forEach((select) => {
    select.addEventListener('change', () => updateStoryService(select.dataset.storyService, select.value));
  });
  document.querySelectorAll('[data-service-allocation]').forEach((input) => {
    input.addEventListener('change', () => updateStoryServiceAllocation(input.dataset.serviceAllocation, input.value));
  });
  document.querySelectorAll('[data-remove-service]').forEach((button) => {
    button.addEventListener('click', () => removeStoryService(button.dataset.removeService));
  });

  document.querySelectorAll('[data-breakdown]').forEach((button) => {
    button.addEventListener('click', () => setBreakdown(button.dataset.breakdown));
  });
  document.querySelector('[data-auth-action]')?.addEventListener('click', (event) => {
    if (cloud.user) {
      event.preventDefault();
      signOut();
    } else if (!siteRuntime.enabled) {
      event.preventDefault();
      signInWithChatGPT();
    }
  });
}

function makeEmptyRoomState() {
  const empty = structuredClone(defaultState);
  empty.selectedStoryId = 'ST-001';
  empty.stories = [{
    id: 'ST-001',
    type: 'Feature',
    title: 'First story to estimate',
    description: 'Add a story, then let the team estimate it together.',
    acceptance: ['Ready for discussion'],
    manual: null,
    ai: null,
    aiEnabled: false,
    saved: false,
    serviceLinks: [],
  }];
  empty.domains = [];
  empty.services = [];
  empty.round = makeRound(empty.selectedStoryId);
  return empty;
}

function roomStatePayload(roomState = makeEmptyRoomState()) {
  return JSON.parse(JSON.stringify(roomState));
}

function normalizeRoomRecord(room) {
  return {
    id: String(room?.id || '').trim(),
    name: String(room?.name || 'Untitled room').trim() || 'Untitled room',
    piLabel: String(room?.piLabel || 'New PI').trim() || 'New PI',
    memberCount: Math.max(1, Number(room?.memberCount) || 1),
    role: room?.role === 'member' ? 'member' : 'owner',
  };
}

function normalizeTeamRecord(team) {
  return {
    id: String(team?.id || '').trim(),
    name: String(team?.name || 'Untitled team').trim() || 'Untitled team',
    role: team?.role === 'member' ? 'member' : 'owner',
    memberCount: Math.max(0, Number(team?.memberCount) || team?.members?.length || 0),
    members: Array.isArray(team?.members) ? team.members.map((member) => ({
      id: String(member?.id || '').trim(),
      name: String(member?.name || 'Planner').trim() || 'Planner',
      email: String(member?.email || '').trim(),
      role: member?.role === 'owner' ? 'owner' : 'member',
    })).filter((member) => member.id) : [],
  };
}

async function refreshWorkspaceData() {
  if (!siteRuntime.ready) return;
  try {
    const [roomsPayload, teamsPayload] = await Promise.all([
      siteRequest(roomScopedApiPath('/api/rooms')),
      siteRequest(roomScopedApiPath('/api/teams')),
    ]);
    cloud.rooms = Array.isArray(roomsPayload.rooms) ? roomsPayload.rooms.map(normalizeRoomRecord) : [];
    cloud.teams = Array.isArray(teamsPayload.teams) ? teamsPayload.teams.map(normalizeTeamRecord) : [];
    cloud.selectedTeamId = cloud.teams.some((team) => team.id === cloud.selectedTeamId) ? cloud.selectedTeamId : cloud.teams[0]?.id || null;
    render();
  } catch (error) {
    console.warn('Pointline workspace refresh failed', error);
  }
}

async function selectRoom(roomId) {
  const room = cloud.rooms.find((candidate) => candidate.id === roomId);
  if (!room) return;
  persistLocalState();

  if (siteRuntime.ready) {
    try {
      const payload = await siteRequest(`/api/state?room=${encodeURIComponent(roomId)}`);
      if (!applySiteState(payload.state)) throw new Error('This room has no stories yet');
      activeRoomId = roomId;
      cloud.roomId = roomId;
      cloud.room = normalizeRoomRecord(payload.room || room);
      cloud.memberCount = Math.max(1, Number(payload.memberCount) || room.memberCount);
      updateRoomUrl(roomId);
      activeView = 'estimates';
      render();
      showToast(`${room.name} is ready`);
    } catch (error) {
      showToast(error.message || 'This room is not available');
    }
    return;
  }

  activeRoomId = roomId;
  cloud.roomId = roomId;
  cloud.room = room;
  cloud.memberCount = room.memberCount;
  state = loadState(roomId);
  localStorage.setItem(ROOM_ID_KEY, roomId);
  updateRoomUrl(roomId);
  activeView = 'estimates';
  render();
  showToast(`${room.name} is ready`);
}

async function createRoomRecord(name, piLabel) {
  if (siteRuntime.ready) {
    const payload = await siteRequest(roomScopedApiPath('/api/rooms'), {
      method: 'POST',
      body: JSON.stringify({ name, piLabel, state: roomStatePayload(makeEmptyRoomState()) }),
    });
    const room = normalizeRoomRecord(payload.room);
    cloud.rooms = [...cloud.rooms.filter((candidate) => candidate.id !== room.id), room];
    cloud.roomId = room.id;
    cloud.room = room;
    cloud.memberCount = room.memberCount;
    activeRoomId = room.id;
    applySiteState(payload.state);
    updateRoomUrl(room.id);
    activeView = 'estimates';
    render();
    showToast(`${name} created`);
    return;
  }

  const id = `room-${Date.now().toString(36)}`;
  const room = { id, name, piLabel, memberCount: 1, role: 'owner' };
  localWorkspace.rooms.push(room);
  saveLocalWorkspace();
  localStorage.setItem(`${STORAGE_KEY}-${id}`, JSON.stringify(makeEmptyRoomState()));
  cloud.rooms = localWorkspace.rooms;
  await selectRoom(id);
  showToast(`${name} created`);
}

function openCreateRoomModal() {
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="create-room-title"><div class="modal-header"><div><p class="section-kicker">New planning space</p><h2 id="create-room-title">Create a room</h2><p>Start with a focused story queue and invite the people who should estimate it.</p></div><button class="icon-button" type="button" data-close-modal aria-label="Close">${icon('x')}</button></div><form class="modal-form" data-create-room-form><div class="modal-field"><label for="room-name">Room name</label><input id="room-name" class="modal-input" name="name" required maxlength="80" placeholder="e.g. Payments PI planning" /></div><div class="modal-field"><label for="room-pi">Increment label</label><input id="room-pi" class="modal-input" name="piLabel" required maxlength="40" placeholder="e.g. PI 25" /></div><div class="modal-footer"><button class="outline-button" type="button" data-close-modal>Cancel</button><button class="primary-button" type="submit">Create room ${icon('plus')}</button></div></form></section></div>`;
  document.querySelector('#room-name').focus();
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
  document.querySelector('[data-modal-backdrop]').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  document.querySelector('[data-create-room-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const name = String(form.get('name') || '').trim();
    const piLabel = String(form.get('piLabel') || '').trim();
    if (!name || !piLabel) return;
    const submit = event.target.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await createRoomRecord(name, piLabel);
      closeModal();
    } catch (error) {
      submit.disabled = false;
      showToast(error.message || 'Room could not be created');
    }
  });
}

async function createTeamRecord(name) {
  if (siteRuntime.ready) {
    const payload = await siteRequest(roomScopedApiPath('/api/teams'), { method: 'POST', body: JSON.stringify({ name }) });
    const team = normalizeTeamRecord(payload.team);
    cloud.teams = [...cloud.teams.filter((candidate) => candidate.id !== team.id), team];
    cloud.selectedTeamId = team.id;
    render();
    showToast(`${name} created`);
    return;
  }

  const member = { id: participantId, name: getUserName(), email: '', role: 'owner' };
  const team = { id: `team-${Date.now().toString(36)}`, name, role: 'owner', members: [member], memberCount: 1 };
  localWorkspace.teams.push(team);
  saveLocalWorkspace();
  cloud.teams = localWorkspace.teams;
  cloud.selectedTeamId = team.id;
  render();
  showToast(`${name} created`);
}

function openCreateTeamModal() {
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="create-team-title"><div class="modal-header"><div><p class="section-kicker">Reusable group</p><h2 id="create-team-title">Create a team</h2><p>Give the group a name, then share its link to add people.</p></div><button class="icon-button" type="button" data-close-modal aria-label="Close">${icon('x')}</button></div><form class="modal-form" data-create-team-form><div class="modal-field"><label for="team-name">Team name</label><input id="team-name" class="modal-input" name="name" required maxlength="80" placeholder="e.g. Commerce squad" /></div><div class="modal-footer"><button class="outline-button" type="button" data-close-modal>Cancel</button><button class="primary-button" type="submit">Create team ${icon('plus')}</button></div></form></section></div>`;
  document.querySelector('#team-name').focus();
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
  document.querySelector('[data-modal-backdrop]').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  document.querySelector('[data-create-team-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = String(new FormData(event.target).get('name') || '').trim();
    if (!name) return;
    const submit = event.target.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await createTeamRecord(name);
      closeModal();
    } catch (error) {
      submit.disabled = false;
      showToast(error.message || 'Team could not be created');
    }
  });
}

function getInviteBaseUrl(token) {
  const url = new URL(window.location.href);
  url.searchParams.set('invite', token);
  if (cloud.roomId) url.searchParams.set('room', cloud.roomId);
  url.hash = '';
  return url.toString();
}

async function createInvite(kind, teamId = null) {
  if (siteRuntime.ready) {
    const payload = await siteRequest(roomScopedApiPath('/api/invites'), {
      method: 'POST',
      body: JSON.stringify({ roomId: cloud.roomId, kind, teamId }),
    });
    return payload.url;
  }
  return getInviteBaseUrl(`local-${kind}-${teamId || cloud.roomId}-${Date.now().toString(36)}`);
}

function renderInviteResultModal(title, description, url) {
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="invite-result-title"><div class="modal-header"><div><p class="section-kicker">Ready to share</p><h2 id="invite-result-title">${escapeHTML(title)}</h2><p>${escapeHTML(description)}</p></div><button class="icon-button" type="button" data-close-modal aria-label="Close">${icon('x')}</button></div><div class="invite-result"><label for="invite-url">Invite link</label><div class="invite-url-row"><input id="invite-url" class="modal-input" readonly value="${escapeHTML(url)}" /><button class="primary-button" type="button" data-copy-invite>${icon('link')}Copy link</button></div><p class="modal-hint">Anyone who opens this link will be asked to sign in, then added to the intended room or team.</p></div><div class="modal-footer"><button class="outline-button" type="button" data-close-modal>Done</button></div></section></div>`;
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
  document.querySelector('[data-modal-backdrop]').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  document.querySelector('[data-copy-invite]').addEventListener('click', () => copyText(url, 'Invite link copied'));
  document.querySelector('#invite-url').select();
}

async function openInviteLink(teamId, kind) {
  const team = cloud.teams.find((candidate) => candidate.id === teamId);
  try {
    const url = await createInvite(kind, teamId);
    renderInviteResultModal(kind === 'team' ? `Invite people to ${team?.name || 'the team'}` : `Invite ${team?.name || 'the team'} to ${getRoomName()}`, kind === 'team' ? 'Share this link with anyone who should join the team.' : 'Share this link with the team. Everyone currently on the team will receive access when the invite is accepted.', url);
  } catch (error) {
    showToast(error.message || 'Invite link could not be created');
  }
}

function openShareModal() {
  const teamOptions = cloud.teams.length ? cloud.teams.map((team) => `<option value="${escapeHTML(team.id)}">${escapeHTML(team.name)} · ${team.members?.length || team.memberCount || 0} people</option>`).join('') : '<option value="">Create a team first</option>';
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="share-room-title"><div class="modal-header"><div><p class="section-kicker">${escapeHTML(getRoomName())}</p><h2 id="share-room-title">Invite people to this room</h2><p>Invite one person, or bring a reusable team into the room in one step.</p></div><button class="icon-button" type="button" data-close-modal aria-label="Close">${icon('x')}</button></div><div class="share-option-list"><button class="share-option" type="button" data-create-person-invite><span class="share-option-icon">${icon('users')}</span><span><strong>Invite people</strong><small>Create a link for individual teammates to join this room.</small></span>${icon('chevron')}</button><div class="share-option share-option-team"><span class="share-option-icon">${icon('layers')}</span><span class="share-option-copy"><strong>Invite a team</strong><small>Everyone on the selected team can join this room.</small></span><select class="modal-input" data-invite-team-select aria-label="Team to invite">${teamOptions}</select><button class="primary-button compact-button" type="button" data-create-team-room-invite ${cloud.teams.length ? '' : 'disabled'}>Create link</button></div></div><div class="modal-footer"><button class="outline-button" type="button" data-close-modal>Cancel</button></div></section></div>`;
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
  document.querySelector('[data-modal-backdrop]').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  document.querySelector('[data-create-person-invite]').addEventListener('click', async () => {
    try {
      const url = await createInvite('room-person');
      renderInviteResultModal(`Invite someone to ${getRoomName()}`, 'Share this link with a teammate who should estimate in this room.', url);
    } catch (error) {
      showToast(error.message || 'Invite link could not be created');
    }
  });
  document.querySelector('[data-create-team-room-invite]')?.addEventListener('click', () => openInviteLink(document.querySelector('[data-invite-team-select]').value, 'room-team'));
}

function selectStory(storyId) {
  if (!state.stories.some((story) => story.id === storyId)) return;
  if (state.round.phase === 'voting' && state.round.storyId !== storyId) {
    showToast('Finish or reset the current voting round first');
    return;
  }
  state.selectedStoryId = storyId;
  if (state.round.storyId !== storyId) state.round = makeRound(storyId, state.round.mode, state.round.roundNumber + 1);
  saveState();
  render();
}

function startVoting() {
  state.round.storyId = state.selectedStoryId;
  state.round.phase = 'voting';
  state.round.cardFlipped = false;
  state.round.revealedAt = null;
  state.round.submittedCount = getRoundVotes().length;
  saveState();
  render();
  showToast(`${state.round.mode === 'hidden' ? 'Hidden' : 'Open'} voting round started`);
}

function setVoteMode(mode) {
  state.round.mode = mode === 'open' ? 'open' : 'hidden';
  saveState();
  render();
}

function flipVoteCard() {
  state.round.cardFlipped = !state.round.cardFlipped;
  document.querySelector('[data-vote-card]')?.classList.toggle('is-flipped', state.round.cardFlipped);
  document.querySelector('[data-flip-card]')?.setAttribute('aria-pressed', String(state.round.cardFlipped));
  saveState();
}

function updateVote(type, value) {
  if (state.round.phase !== 'voting') return;
  const vote = getOwnVote();
  vote[type] = normalizeEstimate(value);
  if (type === 'ai') vote.aiEnabled = true;
  state.round.votes[cloud.user?.id || participantId] = vote;
  saveState();
  syncSiteVote();
  render();
}

function updateCustomVote(input) {
  const value = input.value.trim();
  const estimate = value === '' ? null : normalizeEstimate(value);
  if (value !== '' && estimate === null) {
    showToast('Enter a zero or positive number');
    input.value = '';
    return;
  }
  updateVote(input.dataset.voteCustom, estimate);
}

function revealVotes() {
  if (state.round.phase === 'revealed') {
    state.round.phase = 'voting';
    state.round.revealedAt = null;
    saveState();
    render();
    return;
  }
  if (!getRoundVotes().some((vote) => vote.manual !== null)) {
    showToast('At least one manual vote is needed before reveal');
    return;
  }
  state.round.phase = 'revealed';
  state.round.cardFlipped = false;
  state.round.revealedAt = new Date().toISOString();
  saveState();
  render();
  showToast('Votes revealed to the room');
}

function clearVotes() {
  state.round.votes = {};
  state.round.phase = 'voting';
  state.round.cardFlipped = false;
  state.round.submittedCount = 0;
  state.round.revealedAt = null;
  saveState();
  clearSiteVotes();
  render();
  showToast('Votes cleared — the round is ready again');
}

function resetRound() {
  state.round = makeRound(state.selectedStoryId, state.round.mode, state.round.roundNumber + 1);
  saveState();
  clearSiteVotes();
  render();
  showToast('New voting round ready');
}

function addServiceToStory(serviceId) {
  if (!serviceId) return;
  const story = getSelectedStory();
  const links = normalizeServiceLinks(story.serviceLinks);
  if (links.some((link) => link.serviceId === serviceId)) return;
  const remaining = Math.max(0, 100 - links.reduce((sum, link) => sum + link.allocation, 0));
  if (remaining === 0) {
    showToast('Reduce an existing allocation before adding another service');
    return;
  }
  story.serviceLinks = [...links, { serviceId, allocation: remaining }];
  saveState();
  render();
}

function updateStoryService(previousServiceId, serviceId) {
  const story = getSelectedStory();
  const links = normalizeServiceLinks(story.serviceLinks);
  if (!serviceId || links.some((link) => link.serviceId === serviceId && link.serviceId !== previousServiceId)) return;
  story.serviceLinks = links.map((link) => link.serviceId === previousServiceId ? { ...link, serviceId } : link);
  saveState();
  render();
}

function updateStoryServiceAllocation(serviceId, value) {
  const story = getSelectedStory();
  const links = normalizeServiceLinks(story.serviceLinks);
  const next = Math.min(100, Math.max(0, Number(value) || 0));
  const otherTotal = links.filter((link) => link.serviceId !== serviceId).reduce((sum, link) => sum + link.allocation, 0);
  const allocation = Math.min(next, Math.max(0, 100 - otherTotal));
  story.serviceLinks = links.map((link) => link.serviceId === serviceId ? { ...link, allocation } : link);
  saveState();
  render();
}

function removeStoryService(serviceId) {
  const story = getSelectedStory();
  story.serviceLinks = normalizeServiceLinks(story.serviceLinks).filter((link) => link.serviceId !== serviceId);
  saveState();
  render();
}

function removeDomain(domainId) {
  const domain = getDomain(domainId);
  if (!domain) return;
  state.domains = state.domains.filter((candidate) => candidate.id !== domainId);
  state.services = state.services.map((service) => service.domainId === domainId ? { ...service, domainId: '' } : service);
  saveState();
  render();
  renderServicesModal();
  showToast(`${domain.name} domain removed`);
}

function removeManagedService(serviceId) {
  const service = getService(serviceId);
  if (!service) return;
  state.services = state.services.filter((candidate) => candidate.id !== serviceId);
  state.stories = state.stories.map((story) => ({
    ...story,
    serviceLinks: normalizeServiceLinks(story.serviceLinks).filter((link) => link.serviceId !== serviceId),
  }));
  saveState();
  render();
  renderServicesModal();
  showToast(`${service.name} service removed`);
}

function setBreakdown(kind) {
  document.querySelectorAll('[data-breakdown]').forEach((button) => {
    const active = button.dataset.breakdown === kind;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-breakdown-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.breakdownPanel !== kind;
  });
}

function navigateToView(view) {
  if (!['estimates', 'rooms', 'team', 'resources', 'settings'].includes(view)) return;
  activeView = view;
  window.history.pushState({}, '', `#${view}`);
  render();
}

function updateRoomUrl(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}${activeView === 'estimates' ? '' : `#${activeView}`}`);
}

window.addEventListener('hashchange', () => {
  activeView = getViewFromLocation();
  render();
});

window.addEventListener('popstate', () => {
  activeView = getViewFromLocation();
  render();
});

async function shareRoom() {
  openShareModal();
}

async function copyText(value, message = 'Link copied') {
  try {
    await navigator.clipboard.writeText(value);
    showToast(message);
  } catch {
    showToast('Link ready — copy it from the address bar or modal');
  }
}

function updateCloudStatusBadge() {
  const badge = document.querySelector('.cloud-status');
  if (badge) badge.innerHTML = renderCloudStatus();
}

function signInWithChatGPT() {
  if (siteRuntime.enabled) {
    window.location.assign('/signin-with-chatgpt');
    return;
  }
  showToast('ChatGPT sign-in is available from the hosted Pointline Site');
}

function signOut() {
  if (siteRuntime.enabled) {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/signout-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`);
    return;
  }
  showToast('ChatGPT sign-out is available from the hosted Pointline Site');
}

async function siteRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Pointline request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function roomScopedApiPath(path) {
  if (!cloud.roomId) return path;
  const url = new URL(path, window.location.href);
  url.searchParams.set('room', cloud.roomId);
  return `${url.pathname}${url.search}${url.hash}`;
}

function getVoteIdentity() {
  return cloud.user?.id || participantId;
}

function siteStatePayload() {
  const snapshot = JSON.parse(JSON.stringify(state));
  snapshot.round = { ...snapshot.round, votes: {} };
  return snapshot;
}

function applySiteState(remoteState) {
  if (!remoteState || !Array.isArray(remoteState.stories) || !remoteState.stories.length) return false;
  const hasResourceModel = remoteState.resourceModelVersion === 1;
  const stories = remoteState.stories.map((story) => ({
    ...story,
    id: String(story.id || '').trim(),
    type: String(story.type || 'Feature').trim() || 'Feature',
    title: String(story.title || '').trim() || 'Untitled story',
    description: String(story.description || '').trim() || 'A new story ready for the team to shape and estimate together.',
    acceptance: Array.isArray(story.acceptance) && story.acceptance.length ? story.acceptance.map((item) => String(item)) : ['Ready for discussion'],
    manual: normalizeEstimate(story.manual),
    ai: normalizeEstimate(story.ai),
    aiEnabled: story.aiEnabled === true || normalizeEstimate(story.ai) !== null,
    saved: story.saved === true,
    serviceLinks: Array.isArray(story.serviceLinks) && (hasResourceModel || story.serviceLinks.length)
      ? normalizeServiceLinks(story.serviceLinks)
      : [],
  })).filter((story) => story.id && story.title);
  if (!stories.length) return false;

  const selectedStoryId = stories.some((story) => story.id === remoteState.selectedStoryId)
    ? remoteState.selectedStoryId
    : stories[0].id;
  state = {
    resourceModelVersion: 1,
    sequence: sequences[remoteState.sequence] ? remoteState.sequence : defaultState.sequence,
    selectedStoryId,
    stories,
    domains: Array.isArray(remoteState.domains)
      ? remoteState.domains.map((domain) => ({ id: String(domain.id), name: String(domain.name).trim() })).filter((domain) => domain.name)
      : structuredClone(defaultDomains),
    services: Array.isArray(remoteState.services)
      ? remoteState.services.map((service) => ({ id: String(service.id), name: String(service.name).trim(), domainId: service.domainId ? String(service.domainId) : '' })).filter((service) => service.name)
      : structuredClone(defaultServices),
    round: normalizeRound(remoteState.round, selectedStoryId),
  };
  return true;
}

function startSitePolling() {
  if (siteRuntime.pollTimer) return;
  siteRuntime.pollTimer = window.setInterval(() => refreshSiteState(), 2000);
}

async function refreshSiteState({ renderAfter = true } = {}) {
  if (!siteRuntime.ready || siteRuntime.refreshing || siteStateHasPendingChanges()) return;
  siteRuntime.refreshing = true;
  try {
    const roomId = cloud.roomId ? `?room=${encodeURIComponent(cloud.roomId)}` : '';
    const payload = await siteRequest(`/api/state${roomId}`);
    cloud.memberCount = Math.max(1, Number(payload.memberCount) || 1);
    if (payload.room) cloud.room = normalizeRoomRecord(payload.room);
    if (applySiteState(payload.state)) persistLocalState();
    cloud.status = 'synced';
    if (renderAfter) render();
    else updateCloudStatusBadge();
  } catch (error) {
    cloud.status = error.status === 401 ? 'auth' : 'error';
    updateCloudStatusBadge();
    if (error.status !== 401) console.warn('Pointline Site state refresh failed', error);
  } finally {
    siteRuntime.refreshing = false;
  }
}

function siteStateHasPendingChanges() {
  return Boolean(siteRuntime.saveTimer || siteRuntime.saveInFlight || siteRuntime.stateRevision > siteRuntime.syncedRevision);
}

function queueSiteCloudSync() {
  if (!siteRuntime.enabled || !siteRuntime.ready) return;
  clearTimeout(siteRuntime.saveTimer);
  const revision = siteRuntime.stateRevision;
  const payload = JSON.stringify(siteStatePayload());
  siteRuntime.saveTimer = window.setTimeout(async () => {
    siteRuntime.saveTimer = null;
    siteRuntime.saveInFlight = true;
    try {
      await siteRequest(roomScopedApiPath('/api/state'), { method: 'PUT', body: payload });
      siteRuntime.syncedRevision = Math.max(siteRuntime.syncedRevision, revision);
      cloud.status = 'synced';
      updateCloudStatusBadge();
    } catch (error) {
      cloud.status = error.status === 401 ? 'auth' : 'error';
      updateCloudStatusBadge();
      console.warn('Pointline Site state save failed', error);
      if (error.status !== 401 && siteRuntime.stateRevision >= revision) {
        window.setTimeout(() => queueSiteCloudSync(), 1000);
      }
    } finally {
      siteRuntime.saveInFlight = false;
    }
  }, 250);
}

async function syncSiteVote(retry = 0) {
  if (!siteRuntime.ready || state.round.phase !== 'voting') return;
  const vote = getOwnVote();
  try {
    const payload = await siteRequest(roomScopedApiPath('/api/vote'), {
      method: 'PUT',
      body: JSON.stringify({
        storyId: state.round.storyId,
        roundNumber: state.round.roundNumber,
        manual: vote.manual,
        ai: vote.ai,
        aiEnabled: vote.aiEnabled,
      }),
    });
    state.round.votes[getVoteIdentity()] = vote;
    state.round.submittedCount = Math.max(Number(payload.submittedCount) || 0, getRoundVotes().length);
    persistLocalState();
  } catch (error) {
    if (error.status === 409 && retry === 0) {
      window.setTimeout(() => syncSiteVote(1), 400);
      return;
    }
    cloud.status = error.status === 401 ? 'auth' : 'error';
    updateCloudStatusBadge();
    console.warn('Pointline Site vote sync failed', error);
  }
}

async function clearSiteVotes() {
  if (!siteRuntime.ready) return;
  try {
    await siteRequest(roomScopedApiPath('/api/votes'), {
      method: 'DELETE',
      body: JSON.stringify({ storyId: state.round.storyId, roundNumber: state.round.roundNumber }),
    });
  } catch (error) {
    cloud.status = error.status === 401 ? 'auth' : 'error';
    updateCloudStatusBadge();
    console.warn('Pointline Site vote clear failed', error);
  }
}

async function acceptPendingInvite() {
  const token = new URLSearchParams(window.location.search).get('invite');
  if (!token || !cloud.user) return null;
  const preview = await siteRequest(`/api/invites?token=${encodeURIComponent(token)}`);
  const result = await siteRequest('/api/invites/accept', { method: 'POST', body: JSON.stringify({ token }) });
  const roomId = result.roomId || preview.invite?.room?.id || null;
  const url = new URL(window.location.href);
  url.searchParams.delete('invite');
  if (roomId) url.searchParams.set('room', roomId);
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  if (result.teamId && !roomId) showToast(`You joined ${preview.invite?.team?.name || 'the team'}`);
  else if (roomId) showToast(`You joined ${preview.invite?.room?.name || 'the room'}`);
  return roomId;
}

async function initializeSitesBackend() {
  if (!siteRuntime.enabled) return;
  cloud.status = 'connecting';
  updateCloudStatusBadge();
  render();
  try {
    const configuredRoomId = getConfiguredRoomId();
    let me;
    try {
      me = await siteRequest(`/api/me${configuredRoomId ? `?room=${encodeURIComponent(configuredRoomId)}` : ''}`);
    } catch (error) {
      const hasInvite = new URLSearchParams(window.location.search).has('invite');
      if (error.status !== 403 || !hasInvite) throw error;
      await acceptPendingInvite();
      const acceptedRoomId = getConfiguredRoomId();
      me = await siteRequest(`/api/me${acceptedRoomId ? `?room=${encodeURIComponent(acceptedRoomId)}` : ''}`);
    }
    cloud.user = me.user || null;
    cloud.roomId = me.roomId || null;
    cloud.room = normalizeRoomRecord(me.room);
    cloud.memberCount = Math.max(1, Number(me.memberCount) || 1);
    activeRoomId = cloud.roomId || activeRoomId;
    if (cloud.roomId) localStorage.setItem(ROOM_ID_KEY, cloud.roomId);

    const roomId = cloud.roomId ? `?room=${encodeURIComponent(cloud.roomId)}` : '';
    const payload = await siteRequest(`/api/state${roomId}`);
    cloud.memberCount = Math.max(1, Number(payload.memberCount) || cloud.memberCount);
    if (!applySiteState(payload.state)) {
      await siteRequest(roomScopedApiPath('/api/state'), { method: 'PUT', body: JSON.stringify(siteStatePayload()) });
    } else {
      persistLocalState();
    }
    siteRuntime.syncedRevision = siteRuntime.stateRevision;
    siteRuntime.ready = true;
    cloud.status = 'synced';
    render();
    await refreshWorkspaceData();
    startSitePolling();
  } catch (error) {
    cloud.user = null;
    cloud.status = error.status === 401 ? 'auth' : 'error';
    updateCloudStatusBadge();
    render();
    if (error.status !== 401) console.warn('Pointline Site account setup failed', error);
  }
}

function makeEntityId(prefix, existing) {
  const ids = new Set(existing.map((item) => item.id));
  let id = `${prefix}-${Date.now().toString(36)}`;
  while (ids.has(id)) id = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return id;
}

function openServicesModal() {
  renderServicesModal();
}

function renderServicesModal() {
  const domainOptions = `<option value="">No domain yet</option>${state.domains.map((domain) => `<option value="${escapeHTML(domain.id)}">${escapeHTML(domain.name)}</option>`).join('')}`;
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="services-title"><div class="modal-header"><div><h2 id="services-title">Manage services</h2><p>Keep the ownership map close to the work. A service can belong to one domain, and stories can split their points across services.</p></div><button class="icon-button" type="button" data-close-modal aria-label="Close">${icon('x')}</button></div><div class="service-manager-grid"><div class="service-manager-column"><div class="manager-heading"><div><strong>Domains</strong><span>${state.domains.length} configured</span></div></div><form class="manager-form" data-domain-form><input class="modal-input" name="name" required maxlength="80" placeholder="e.g. Customer experience" aria-label="Domain name" /><button class="primary-button" type="submit">${icon('plus')}Add</button></form><div class="manager-list">${state.domains.length ? state.domains.map((domain) => `<div class="manager-row"><span class="manager-dot"></span><span class="manager-row-copy"><strong>${escapeHTML(domain.name)}</strong></span><button class="icon-button compact-icon" type="button" data-remove-domain="${escapeHTML(domain.id)}" aria-label="Remove ${escapeHTML(domain.name)}">${icon('x')}</button></div>`).join('') : '<p class="empty-manager">No domains yet.</p>'}</div></div><div class="service-manager-column"><div class="manager-heading"><div><strong>Services</strong><span>${state.services.length} configured</span></div></div><form class="manager-form manager-service-form" data-service-form><input class="modal-input" name="name" required maxlength="80" placeholder="e.g. Checkout API" aria-label="Service name" /><select class="modal-input" name="domainId" aria-label="Service domain">${domainOptions}</select><button class="primary-button" type="submit">${icon('plus')}Add</button></form><div class="manager-list">${state.services.length ? state.services.map((service) => `<div class="manager-row manager-service-row"><span><strong>${escapeHTML(service.name)}</strong><small>${escapeHTML(getDomain(service.domainId)?.name || 'No domain')}</small></span><select class="manager-domain-select" data-service-domain="${escapeHTML(service.id)}" aria-label="Domain for ${escapeHTML(service.name)}">${domainOptions.replace(`value="${escapeHTML(service.domainId || '')}"`, `value="${escapeHTML(service.domainId || '')}" selected`)}</select><button class="icon-button compact-icon" type="button" data-remove-managed-service="${escapeHTML(service.id)}" aria-label="Remove ${escapeHTML(service.name)}">${icon('x')}</button></div>`).join('') : '<p class="empty-manager">No services yet.</p>'}</div></div></div><p class="manager-note">Removing a domain leaves its services unassigned. Removing a service clears it from story allocations but keeps story history.</p><div class="modal-footer"><button class="primary-button" type="button" data-close-modal>Done</button></div></section></div>`;

  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
  document.querySelector('[data-modal-backdrop]').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  document.querySelector('[data-domain-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = String(new FormData(event.target).get('name') || '').trim();
    if (!name || state.domains.some((domain) => domain.name.toLowerCase() === name.toLowerCase())) {
      showToast('Add a unique domain name');
      return;
    }
    state.domains.push({ id: makeEntityId('domain', state.domains), name });
    saveState();
    render();
    renderServicesModal();
    showToast(`${name} domain added`);
  });
  document.querySelector('[data-service-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const name = String(form.get('name') || '').trim();
    const domainId = String(form.get('domainId') || '');
    if (!name || state.services.some((service) => service.name.toLowerCase() === name.toLowerCase())) {
      showToast('Add a unique service name');
      return;
    }
    state.services.push({ id: makeEntityId('service', state.services), name, domainId });
    saveState();
    render();
    renderServicesModal();
    showToast(`${name} service added`);
  });
  document.querySelectorAll('[data-service-domain]').forEach((select) => {
    select.addEventListener('change', () => {
      const service = getService(select.dataset.serviceDomain);
      if (!service) return;
      service.domainId = select.value;
      saveState();
      render();
      renderServicesModal();
    });
  });
  document.querySelectorAll('[data-remove-domain]').forEach((button) => {
    button.addEventListener('click', () => removeDomain(button.dataset.removeDomain));
  });
  document.querySelectorAll('[data-remove-managed-service]').forEach((button) => {
    button.addEventListener('click', () => removeManagedService(button.dataset.removeManagedService));
  });
}

function updateCustomEstimate(input) {
  const value = input.value.trim();
  const story = getSelectedStory();
  const type = input.dataset.customType;
  const estimate = value === '' ? null : normalizeEstimate(value);

  if (value !== '' && estimate === null) {
    showToast('Enter a zero or positive number');
    input.value = story[type] === null ? '' : story[type];
    return;
  }

  story[type] = estimate;
  story.saved = false;
  if (type === 'ai' && estimate !== null) story.aiEnabled = true;
  saveState();
  render();
}

function saveAndNext() {
  const story = getSelectedStory();
  if (story.manual === null) {
    showToast('Add the team estimate before moving on');
    return;
  }

  story.saved = true;
  const nextStory = state.stories.find((candidate) => candidate.manual === null);
  state.selectedStoryId = nextStory ? nextStory.id : story.id;
  saveState();
  render();
  showToast(nextStory ? `${story.id} saved — next story is ready` : 'All stories have a team estimate');
}

function openNewStoryModal() {
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="new-story-title">
    <div class="modal-header"><div><h2 id="new-story-title">Add a story</h2><p>Keep it lightweight. You can estimate the detail with the team.</p></div><button class="icon-button" type="button" data-close-modal aria-label="Close">${icon('plus')}</button></div>
    <form class="modal-form" data-new-story-form>
      <div class="modal-field"><label for="new-story-name">Story title</label><input id="new-story-name" class="modal-input" name="title" required maxlength="120" placeholder="e.g. Add audit history to project changes" /></div>
      <div class="modal-field"><label for="new-story-description">Short description <span style="color: var(--ink-soft); font-weight: 500;">(optional)</span></label><textarea id="new-story-description" class="modal-input" name="description" maxlength="280" placeholder="As a… I want… so that…"></textarea></div>
      <div class="modal-footer"><button class="outline-button" type="button" data-close-modal>Cancel</button><button class="primary-button" type="submit">Add story ${icon('plus')}</button></div>
    </form>
  </section></div>`;

  const titleInput = document.querySelector('#new-story-name');
  titleInput.focus();
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
  document.querySelector('[data-modal-backdrop]').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  document.querySelector('[data-new-story-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const title = String(form.get('title') || '').trim();
    const description = String(form.get('description') || '').trim();
    if (!title) return;

    const storyNumber = 104 + state.stories.length;
    const story = {
      id: `PL-${storyNumber}`,
      type: 'Feature',
      title,
      description: description || 'A new story ready for the team to shape and estimate together.',
      acceptance: ['Ready for discussion'],
    manual: null,
    ai: null,
    aiEnabled: false,
    saved: false,
    serviceLinks: [],
  };
    state.stories.push(story);
    state.selectedStoryId = story.id;
    saveState();
    closeModal();
    render();
    showToast(`${story.id} added to the queue`);
  });
}

function openImportModal() {
  importDraft = { mode: 'text', text: '', fileName: '' };
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="import-stories-title">
    <div class="modal-header"><div><h2 id="import-stories-title">Import stories</h2><p>Bring in a backlog from a text list or a CSV file. Estimates start blank.</p></div><button class="icon-button" type="button" data-close-modal aria-label="Close">${icon('x')}</button></div>
    <div class="import-tabs" role="tablist" aria-label="Import source"><button class="import-tab active" type="button" data-import-mode="text" role="tab" aria-selected="true">Paste text list</button><button class="import-tab" type="button" data-import-mode="file" role="tab" aria-selected="false">Upload CSV / TXT</button></div>
    <div class="import-panel" data-import-panel="text"><div class="modal-field"><label for="import-text">Story list</label><textarea id="import-text" class="modal-input import-textarea" data-import-text placeholder="- Add audit history\n- Let owners archive a workspace\n- Export PI estimates"></textarea><p class="import-hint">One story per line. Optional: <code>Title | Description</code>.</p></div></div>
    <div class="import-panel" data-import-panel="file" hidden><label class="file-drop" for="import-file"><input id="import-file" type="file" accept=".csv,.txt,text/csv,text/plain" data-import-file /><span><span class="file-drop-icon">${icon('upload')}</span><strong>Choose a CSV or text file</strong><span data-import-file-name>CSV headers: title, description, type, acceptance, id</span></span></label><p class="import-hint">A TXT file uses one story per line. Quoted CSV values and commas are supported.</p></div>
    <div class="import-preview"><div class="import-preview-header"><strong>Import preview</strong><span class="import-preview-count empty" data-import-count>No stories yet</span></div><ul class="import-preview-list" data-import-preview-list><li class="more">Add a line or choose a file to preview stories.</li></ul></div>
    <div class="modal-footer"><button class="outline-button" type="button" data-close-modal>Cancel</button><button class="primary-button" type="button" data-import-submit disabled>Import stories ${icon('upload')}</button></div>
  </section></div>`;

  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
  document.querySelector('[data-modal-backdrop]').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  document.querySelectorAll('[data-import-mode]').forEach((button) => {
    button.addEventListener('click', () => setImportMode(button.dataset.importMode));
  });
  document.querySelector('[data-import-text]').addEventListener('input', (event) => {
    importDraft.text = event.target.value;
    updateImportPreview();
  });
  document.querySelector('[data-import-file]').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    importDraft.mode = 'file';
    importDraft.fileName = file.name;
    importDraft.text = await file.text();
    document.querySelector('[data-import-file-name]').textContent = `${file.name} loaded`;
    updateImportPreview();
  });
  document.querySelector('[data-import-submit]').addEventListener('click', () => {
    const stories = parseImportDraft();
    if (!stories.length) {
      showToast('No stories found to import');
      return;
    }
    addImportedStories(stories);
  });
  updateImportPreview();
}

function setImportMode(mode) {
  importDraft.mode = mode;
  if (mode === 'file') {
    importDraft.text = '';
    importDraft.fileName = '';
    document.querySelector('[data-import-file]').value = '';
    document.querySelector('[data-import-file-name]').textContent = 'CSV headers: title, description, type, acceptance, id';
  }
  if (mode === 'text') {
    importDraft.text = '';
    importDraft.fileName = '';
    document.querySelector('[data-import-text]').value = '';
    document.querySelector('[data-import-file]').value = '';
    document.querySelector('[data-import-file-name]').textContent = 'CSV headers: title, description, type, acceptance, id';
  }

  document.querySelectorAll('[data-import-mode]').forEach((button) => {
    const active = button.dataset.importMode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-import-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.importPanel !== mode;
  });
  updateImportPreview();
}

function closeModal() {
  document.querySelector('#modal-root').innerHTML = '';
}

function showToast(message) {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.remove(), 2600);
}

render();
initializeSitesBackend();
