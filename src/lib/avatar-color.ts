/**
 * Stable color palette for avatar fallbacks. Each pair is readable in light mode
 * and uses a subtle tinted background so avatars never clash with the card surface.
 * Colors are hashed from the display name so the same user gets the same color
 * across the whole app.
 */
const AVATAR_PALETTE = [
  { bg: 'bg-[hsl(225_85%_96%)]', text: 'text-[hsl(225_75%_40%)]' },
  { bg: 'bg-[hsl(152_55%_94%)]', text: 'text-[hsl(152_55%_30%)]' },
  { bg: 'bg-[hsl(38_85%_94%)]', text: 'text-[hsl(32_70%_38%)]' },
  { bg: 'bg-[hsl(340_75%_96%)]', text: 'text-[hsl(340_65%_42%)]' },
  { bg: 'bg-[hsl(265_70%_96%)]', text: 'text-[hsl(265_55%_45%)]' },
  { bg: 'bg-[hsl(199_82%_94%)]', text: 'text-[hsl(199_70%_35%)]' },
  { bg: 'bg-[hsl(78_65%_93%)]', text: 'text-[hsl(85_55%_28%)]' },
  { bg: 'bg-[hsl(15_75%_95%)]', text: 'text-[hsl(15_65%_40%)]' },
] as const;

export type AvatarPaletteToken = (typeof AVATAR_PALETTE)[number];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getAvatarColor(seed: string | null | undefined): AvatarPaletteToken {
  const key = (seed || '').trim().toLowerCase();
  if (!key) return AVATAR_PALETTE[0];
  return AVATAR_PALETTE[hashString(key) % AVATAR_PALETTE.length];
}

export function getInitials(name: string | null | undefined, max = 2): string {
  const value = (name || '').trim();
  if (!value) return '??';
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, max).toUpperCase();
  return parts
    .slice(0, max)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}
