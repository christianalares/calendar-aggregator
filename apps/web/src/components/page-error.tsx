import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function PageError({ reset }: { reset: () => void }) {
  const queryBoundary = useQueryErrorResetBoundary()
  const router = useRouter()

  return (
    <main className="page-shell space-y-4 py-10">
      <h1 className="font-heading text-2xl font-bold">Could not load this page</h1>
      <p>Please try again.</p>
      <Button
        type="button"
        onClick={async () => {
          queryBoundary.reset()
          await router.invalidate()
          reset()
        }}
      >
        Try again
      </Button>
    </main>
  )
}
