import { Tabs } from '@base-ui/react/tabs'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/** Shared workspace tabs with keyboard navigation and named panels. */
export function SegmentedTabs<T extends string>({
  label,
  value,
  options,
  disabled = false,
  compact = false,
  onChange,
  children,
}: {
  label: string
  value: T
  options: { value: T; label: ReactNode }[]
  disabled?: boolean
  compact?: boolean
  onChange: (value: T) => void
  children: ReactNode
}) {
  return (
    <Tabs.Root
      value={value}
      onValueChange={(next) => {
        if (options.some((item) => item.value === next)) onChange(next)
      }}
      className="min-w-0 space-y-4"
    >
      <Tabs.List
        aria-label={label}
        activateOnFocus
        className="flex gap-1 rounded-xl bg-secondary p-1"
      >
        {options.map((item) => (
          <Tabs.Tab
            key={item.value}
            value={item.value}
            disabled={disabled}
            render={
              <Button
                type="button"
                size={compact ? 'sm' : 'default'}
                variant={value === item.value ? 'outline' : 'ghost'}
                className={compact ? 'h-8 flex-1 px-2 text-xs' : 'flex-1'}
              />
            }
          >
            {item.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {options.map((item) => (
        <Tabs.Panel key={item.value} value={item.value} className="min-w-0 outline-offset-4">
          {value === item.value ? children : null}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  )
}
