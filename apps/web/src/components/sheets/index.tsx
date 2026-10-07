import { createPushModal } from 'pushmodal/base-ui'

import { Sheet } from '@/components/ui/sheet'

// Register future sheets with shorthand components; the factory supplies Sheet.
export const {
  pushModal: pushSheet,
  popModal: popSheet,
  ModalProvider: SheetProvider,
} = createPushModal({ Wrapper: Sheet, modals: {} })
