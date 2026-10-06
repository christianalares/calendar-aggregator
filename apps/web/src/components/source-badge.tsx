import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const sourceTones = [
  {
    badge: 'bg-category-blue text-category-blue-foreground',
    marker: 'bg-category-blue-marker',
  },
  {
    badge: 'bg-category-rose text-category-rose-foreground',
    marker: 'bg-category-rose-marker',
  },
  {
    badge: 'bg-category-cyan text-category-cyan-foreground',
    marker: 'bg-category-cyan-marker',
  },
  {
    badge: 'bg-category-peach text-category-peach-foreground',
    marker: 'bg-category-peach-marker',
  },
  {
    badge: 'bg-category-violet text-category-violet-foreground',
    marker: 'bg-category-violet-marker',
  },
  {
    badge: 'bg-category-mint text-category-mint-foreground',
    marker: 'bg-category-mint-marker',
  },
] as const

// Source identity keeps its color across calendars, sorting, and appearances.
function sourceTone(sourceId: string) {
  let hash = 0
  for (const character of sourceId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return sourceTones[hash % sourceTones.length] ?? sourceTones[0]
}

export function SourceMarker({ sourceId }: { sourceId: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-2 shrink-0 rounded-full', sourceTone(sourceId).marker)}
    />
  )
}

export function SourceBadge({ sourceId, children }: { sourceId: string; children: ReactNode }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'h-auto min-h-5 max-w-full whitespace-normal break-words font-normal',
        sourceTone(sourceId).badge,
      )}
    >
      {children}
    </Badge>
  )
}
