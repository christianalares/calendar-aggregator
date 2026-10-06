import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'

export function PageError({ reset }: { reset: () => void }) {
  const queryBoundary = useQueryErrorResetBoundary()
  const router = useRouter()

  return (
    <main className="container">
      <h1>Could not load this page</h1>
      <p>Please try again.</p>
      <button
        type="button"
        onClick={async () => {
          queryBoundary.reset()
          await router.invalidate()
          reset()
        }}
      >
        Try again
      </button>
    </main>
  )
}
