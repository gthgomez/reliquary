import type { SVGProps } from "react";
import type { BattleCommand } from "../../world/encounters.ts";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 24, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="square"
      strokeLinejoin="miter"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function SwordIcon(props: IconProps) {
  return (
    <Icon {...props}>
      {/* Crossed blades with square pommels. */}
      <path d="M3 4h4l13 13-2 2L4 8V4Z" fill="currentColor" fillOpacity="0.28" />
      <path d="M21 4h-4L4 17l2 2L21 8V4Z" fill="currentColor" fillOpacity="0.28" />
      <path d="M16 18l3 3M8 18l-3 3M17 21h3v-3M7 21H4v-3" />
      <path d="M4 4l3 3M20 4l-3 3" />
    </Icon>
  );
}

export function SkillIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
      <path d="M12 7l1.6 3.4L17 12l-3.4 1.6L12 17l-1.6-3.4L7 12l3.4-1.6L12 7Z" fill="currentColor" fillOpacity="0.35" />
      <path d="M18.5 4.5l1 1.5-1.5 1-1-1.5 1.5-1ZM5 18l1.5 1-1 1.5L4 19.5 5 18Z" />
    </Icon>
  );
}

export function ItemIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 3h6v3l-1 1v2h-4V7L9 6V3Z" fill="currentColor" fillOpacity="0.22" />
      <path d="M8 9h8l2 3v7l-2 2H8l-2-2v-7l2-3Z" />
      <path d="M6 14h12" />
      <path d="M10 17h4" />
    </Icon>
  );
}

export function BindIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </Icon>
  );
}

export function PartyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="6" r="2.4" fill="currentColor" fillOpacity="0.25" />
      <circle cx="5.5" cy="9" r="2" />
      <circle cx="18.5" cy="9" r="2" />
      <path d="M8 13h8l1.5 7h-11L8 13Z" fill="currentColor" fillOpacity="0.22" />
      <path d="M2 13h4l1 6H1l1-6ZM18 13h4l1 6h-6l1-6Z" />
    </Icon>
  );
}

export function FleeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="14.5" cy="4.8" r="2" fill="currentColor" fillOpacity="0.25" />
      <path d="M12.5 8.5 15 12l3 1M12.5 8.5 9 11l-2 4M15 12l-1 4-3 4M14 16l3 4" />
      <path d="M4 12h4M2 16h4" />
    </Icon>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth="1.5">
      <path d="M12 20s-7-4.6-7-9.2C5 7.6 7 6 9.2 6c1.5 0 2.4.8 2.8 1.4C12.4 6.8 13.3 6 14.8 6 17 6 19 7.6 19 10.8 19 15.4 12 20 12 20Z" fill="currentColor" fillOpacity="0.85" />
    </Icon>
  );
}

export function ManaIcon(props: IconProps) {
  return (
    <Icon {...props} strokeWidth="1.5">
      <path d="M12 3l6 8-6 10-6-10 6-8Z" fill="currentColor" fillOpacity="0.8" />
      <path d="M12 7l3 4-3 5-3-5 3-4Z" fill="var(--bq-panel-deep, #061826)" stroke="none" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10.5V17" />
      <rect x="11" y="6.6" width="2" height="2" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m8 5 7 7-7 7" />
    </Icon>
  );
}

const COMMAND_ICONS: Record<BattleCommand, (props: IconProps) => ReturnType<typeof Icon>> = {
  Strike: SwordIcon,
  Skill: SkillIcon,
  Item: ItemIcon,
  Bind: BindIcon,
  Party: PartyIcon,
  Flee: FleeIcon,
};

export function BattleCommandIcon({ command, size = 24 }: { command: BattleCommand; size?: number }) {
  const Component = COMMAND_ICONS[command];
  return <Component size={size} />;
}
