export type Role = 'admin' | 'owner' | 'member';

export type User = {
  id: string;
  username?: string;
  name?: string;
  email?: string;
  role: Role;
};

export type RoomMemberRole = 'owner' | 'developer' | 'observer';

export type RoomMember = {
  id: string;
  name: string;
  email: string;
  role: RoomMemberRole;
  teamId: string | null;
  teamName: string | null;
};

export type RoomTeam = {
  id: string;
  name: string;
  memberCount: number;
};

export type Room = {
  id: string;
  name: string;
  piLabel: string;
  memberCount: number;
  teamCount?: number;
  role: Role;
  stateVersion?: number;
  members?: RoomMember[];
  teams?: RoomTeam[];
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'developer' | 'observer';
};

export type Team = {
  id: string;
  name: string;
  role: 'owner' | 'member';
  memberCount: number;
  members: TeamMember[];
};

export type Estimate = number | null;

export type CapacityMember = {
  id: string;
  name: string;
  office: 'beirut' | 'cyprus';
  trainStaffDevCapacityPct: number;
};

export type CapacitySprint = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  excludeFromTotal: boolean;
  holidayDaysBeirut: number;
  holidayDaysCyprus: number;
  availabilityDays: Record<string, number>;
};

export type CapacityState = {
  defaults: {
    ceremoniesPct: number;
    featureCapacityPct: number;
    codeReviewPct: number;
    supportCapacityPct: number;
  };
  members: CapacityMember[];
  sprints: CapacitySprint[];
  storySprintIds: Record<string, string>;
};

export type AdminUser = User & {
  disabled: boolean;
  createdAt?: string;
  lastLoginAt?: string | null;
};

export type Story = {
  id: string;
  type: string;
  epicId: string | null;
  title: string;
  url: string;
  description: string;
  acceptance: string[];
  manual: Estimate;
  ai: Estimate;
  aiEnabled: boolean;
  saved: boolean;
  stretch: boolean;
  serviceLinks: Array<{ serviceId: string; allocation: number }>;
};

export type RoundPlayer = {
  id: string;
  name: string;
  role: RoomMemberRole;
  joined: boolean;
  hasVoted: boolean;
  manualSubmitted: boolean;
  aiSubmitted: boolean;
  manual: Estimate;
  ai: Estimate;
  aiEnabled: boolean;
};

export type RoundVote = {
  name: string;
  manual: Estimate;
  ai: Estimate;
  aiEnabled: boolean;
};

export type Round = {
  phase: 'idle' | 'voting' | 'revealed' | 'paused';
  mode: 'hidden' | 'open';
  hideVoteCountUntilComplete: boolean;
  storyId: string | null;
  roundNumber: number;
  submittedCount: number;
  votes: Record<string, RoundVote>;
  cardFlipped: boolean;
  revealedAt: string | null;
  timerStartedAt: string | null;
  timerEndsAt: string | null;
  players: RoundPlayer[];
};

export type RoomState = {
  resourceModelVersion: number;
  capacity: CapacityState;
  sequence: 'sequential' | 'fibonacci' | 'modified';
  roomSettings: {
    aiEnabled: boolean;
    voteMode: 'hidden' | 'open';
    hideVoteCountUntilComplete: boolean;
  };
  selectedStoryId: string | null;
  stories: Story[];
  domains: Array<{ id: string; name: string }>;
  services: Array<{ id: string; name: string; domainId: string }>;
  voteHistory: Array<{
    storyId: string;
    roundNumber: number;
    voterId: string;
    voterName: string;
    manual: Estimate;
    ai: Estimate;
    aiEnabled: boolean;
    updatedAt: string | null;
  }>;
  round: Round;
};

export type RoomPayload = {
  roomId: string;
  memberCount: number;
  room: Room;
  state: RoomState | null;
};

