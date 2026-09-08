import type { Story } from './types';

export function emptyStory(input: Partial<Story> = {}): Story {
  return {
    id: input.id || '',
    type: input.type || 'Feature',
    epicId: input.epicId ?? null,
    title: input.title || '',
    url: input.url || '',
    description: input.description || 'A new story ready for the team to shape and estimate together.',
    acceptance: input.acceptance?.length ? input.acceptance : ['Ready for discussion'],
    manual: input.manual ?? null,
    ai: input.ai ?? null,
    aiEnabled: input.aiEnabled ?? false,
    saved: input.saved ?? false,
    serviceLinks: input.serviceLinks ? input.serviceLinks.map((link) => ({ ...link })) : [],
  };
}

export function normalizeImportedStory(input: {
  id?: string;
  title?: string;
  description?: string;
  type?: string;
  acceptance?: string;
}): Story | null {
  const title = String(input.title || '').trim();
  if (!title) return null;
  const acceptance = String(input.acceptance || '')
    .split(/[;\n|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
  return emptyStory({
    id: String(input.id || '').trim(),
    title,
    description: String(input.description || '').trim() || undefined,
    type: String(input.type || '').trim() || 'Feature',
    acceptance,
  });
}

export function parseTextList(text: string): Story[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, ''))
    .filter(Boolean)
    .map((line) => {
      const [title, description, type, acceptance] = line.split('|').map((part) => part.trim());
      return normalizeImportedStory({ title, description, type, acceptance });
    })
    .filter((story): story is Story => story !== null);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
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

function normalizeHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function parseCsvList(text: string): Story[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map(normalizeHeader);
  const supported = new Set(['id', 'title', 'story', 'summary', 'description', 'type', 'acceptance', 'acceptancecriteria']);
  const hasHeader = headers.some((header) => supported.has(header));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const indexOf = (...names: string[]) => headers.findIndex((header) => names.includes(header));
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
    .filter((story): story is Story => story !== null);
}

export function nextImportedStoryId(stories: Story[]): string {
  const numbers = stories
    .map((story) => Number(String(story.id).match(/(\d+)$/)?.[1] || 0))
    .filter((number) => Number.isFinite(number));
  return `PL-${Math.max(103, ...numbers) + 1}`;
}
