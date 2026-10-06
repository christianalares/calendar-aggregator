export function ErrorMessage({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="m-0 text-sm text-destructive">
      {error.message || 'Could not save. Please try again.'}
    </p>
  ) : null
}
