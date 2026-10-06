import { createPushModal } from 'pushmodal'
import { ModalWrapper } from '@/components/overlays/pushmodal-wrappers'
import { CalendarModal } from './calendar-modal'
import { CalendarPreviewModal } from './calendar-preview-modal'
import { SourceModal } from './source-modal'

export const { pushModal, popModal, ModalProvider } = createPushModal({
  modals: {
    source: { Component: SourceModal, Wrapper: ModalWrapper },
    calendar: { Component: CalendarModal, Wrapper: ModalWrapper },
    calendarPreview: { Component: CalendarPreviewModal, Wrapper: ModalWrapper },
  },
})
