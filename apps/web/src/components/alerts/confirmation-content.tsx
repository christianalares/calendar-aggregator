import { ErrorMessage } from '@/components/error-message'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function ConfirmationContent({
  title,
  description,
  action,
  pending,
  error,
  onConfirm,
}: {
  title: string
  description: string
  action: string
  pending: boolean
  error: Error | null
  onConfirm: () => void
}) {
  return (
    <AlertDialogContent className="max-h-[90dvh] overflow-y-auto font-sans">
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <ErrorMessage error={error} />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" disabled={pending} onClick={onConfirm}>
          {pending ? 'Working...' : action}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}
