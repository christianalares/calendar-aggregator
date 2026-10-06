import { type ComponentType, type ReactNode, useEffect, useState } from 'react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Dialog } from '@/components/ui/dialog'
import { Sheet } from '@/components/ui/sheet'

type WrapperProps = {
  open: boolean
  onOpenChange: (open?: boolean) => void
  children: ReactNode
  defaultOpen?: boolean
}

function createWrapper(Root: ComponentType<Omit<WrapperProps, 'defaultOpen'>>) {
  return function PushModalWrapper({ open, onOpenChange, children }: WrapperProps) {
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])

    // pushmodal mounts roots already open. Start closed so Base UI observes the
    // opening transition; ignore defaultOpen because the registry controls state.
    return (
      <Root open={mounted && open} onOpenChange={onOpenChange}>
        {children}
      </Root>
    )
  }
}

export const ModalWrapper = createWrapper(Dialog)
export const SheetWrapper = createWrapper(Sheet)
export const AlertWrapper = createWrapper(AlertDialog)
