import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'

export function SectionHeader({
  title,
  count,
  description,
  action,
}: {
  title: string
  count: number
  description: string
  action: ReactNode
}) {
  return (
    <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
        <Badge variant="secondary" className="tabular-nums">
          {count}
        </Badge>
      </div>
      <div className="col-start-2 row-start-1 justify-self-end sm:row-span-2">{action}</div>
      <p className="col-span-2 text-sm text-muted-foreground sm:col-span-1">{description}</p>
    </div>
  )
}
