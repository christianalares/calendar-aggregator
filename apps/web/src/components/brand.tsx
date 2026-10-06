import { CalendarDays } from 'lucide-react'

export function Brand() {
  return (
    <a
      href="/"
      className="flex w-fit items-center gap-2.5 font-heading text-xl font-extrabold tracking-tight"
    >
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <CalendarDays aria-hidden="true" className="size-5" />
      </span>
      CalPal
    </a>
  )
}
