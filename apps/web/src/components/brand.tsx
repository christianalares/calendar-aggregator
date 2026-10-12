import { Logo } from '@/components/logo'

export function Brand() {
  return (
    <a
      href="/"
      aria-label="CalPal home"
      className="flex w-fit items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <Logo aria-hidden="true" />
    </a>
  )
}
