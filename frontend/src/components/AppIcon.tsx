import { createElement, type SVGProps } from 'react';
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Boxes,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Clock3,
  Columns3,
  DoorOpen,
  ExternalLink,
  Gauge,
  Inbox,
  Kanban,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Move,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  UsersRound,
  X,
  type IconNode,
} from 'lucide';

const iconSet = {
  arrowDown: ArrowDown,
  arrowRightLeft: ArrowRightLeft,
  arrowUp: ArrowUp,
  boxes: Boxes,
  briefcase: BriefcaseBusiness,
  check: Check,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  circleDot: CircleDot,
  clock: Clock3,
  columns3: Columns3,
  door: DoorOpen,
  externalLink: ExternalLink,
  gauge: Gauge,
  inbox: Inbox,
  kanban: Kanban,
  layout: LayoutDashboard,
  listChecks: ListChecks,
  logOut: LogOut,
  move: Move,
  panelClose: PanelLeftClose,
  panelOpen: PanelLeftOpen,
  pencil: Pencil,
  plus: Plus,
  refresh: RotateCcw,
  search: Search,
  settings: Settings2,
  shield: Shield,
  sparkles: Sparkles,
  trash: Trash2,
  upload: Upload,
  userPlus: UserPlus,
  users: UsersRound,
  x: X,
} as const satisfies Record<string, IconNode>;

export type AppIconName = keyof typeof iconSet;

type AppIconProps = {
  name: AppIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export function AppIcon({ name, size = 16, strokeWidth = 1.9, className }: AppIconProps) {
  const nodes = iconSet[name];
  const svgProps: SVGProps<SVGSVGElement> = {
    'aria-hidden': 'true',
    className,
    fill: 'none',
    height: size,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth,
    viewBox: '0 0 24 24',
    width: size,
  };

  return <svg {...svgProps}>{nodes.map(([tag, attrs], index) => createElement(tag, { ...attrs, key: index }))}</svg>;
}
