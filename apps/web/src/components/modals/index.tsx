import { createPushModal } from 'pushmodal/base-ui'
import { CalendarModal } from './calendar-modal'
import { CalendarPreviewModal } from './calendar-preview-modal'
import { SourceModal } from './source-modal'

export const { pushModal, popModal, ModalProvider } = createPushModal({
  modals: {
    source: SourceModal,
    calendar: CalendarModal,
    calendarPreview: CalendarPreviewModal,
  },
})
