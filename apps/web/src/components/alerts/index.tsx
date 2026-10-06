import { createPushModal } from 'pushmodal'
import { AlertWrapper } from '@/components/overlays/pushmodal-wrappers'
import { DeleteCalendarAlert } from './delete-calendar-alert'
import { DeleteSourceAlert } from './delete-source-alert'
import { ReplaceCalendarLinkAlert } from './replace-calendar-link-alert'
import { RevokeInviteAlert } from './revoke-invite-alert'

export const {
  pushModal: pushAlert,
  popModal: popAlert,
  ModalProvider: AlertProvider,
} = createPushModal({
  modals: {
    deleteSource: { Component: DeleteSourceAlert, Wrapper: AlertWrapper },
    deleteCalendar: { Component: DeleteCalendarAlert, Wrapper: AlertWrapper },
    replaceCalendarLink: { Component: ReplaceCalendarLinkAlert, Wrapper: AlertWrapper },
    revokeInvite: { Component: RevokeInviteAlert, Wrapper: AlertWrapper },
  },
})
