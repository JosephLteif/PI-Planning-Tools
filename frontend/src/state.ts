import type { RoomState } from './types';

export const sequences = {
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
} as const;

export function defaultRoomState(): RoomState {
  return {
    resourceModelVersion: 1,
    capacity: {
      defaults: {
        ceremoniesPct: 0.13,
        featureCapacityPct: 0.8,
        codeReviewPct: 0,
        supportCapacityPct: 0.2,
      },
      members: [],
      sprints: [],
    },
    sequence: 'fibonacci',
    roomSettings: {
      aiEnabled: true,
      voteMode: 'hidden',
      hideVoteCountUntilComplete: false,
    },
    selectedStoryId: 'ST-001',
    stories: [{
      id: 'ST-001',
      type: 'Feature',
      epicId: null,
      title: 'First story to estimate',
      url: '',
      description: 'Add a story, then let the team estimate it together.',
      acceptance: ['Ready for discussion'],
      manual: null,
      ai: null,
      aiEnabled: false,
      saved: false,
      stretch: false,
      serviceLinks: [],
    }],
    domains: [],
    services: [],
    voteHistory: [],
    round: {
      phase: 'idle',
      mode: 'hidden',
      hideVoteCountUntilComplete: false,
      storyId: 'ST-001',
      roundNumber: 1,
      submittedCount: 0,
      votes: {},
      cardFlipped: false,
      revealedAt: null,
      timerStartedAt: null,
      timerEndsAt: null,
      players: [],
    },
  };
}

export function cloneState(state: RoomState): RoomState {
  return structuredClone(state);
}

export function displayName(user: { name?: string; username?: string; email?: string }): string {
  return user.name || user.username || user.email?.split('@')[0] || 'Planner';
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'P';
}
