import { createPushModal } from 'pushmodal/base-ui'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { DeleteCalendarAlert } from './delete-calendar-alert'
import { DeleteSourceAlert } from './delete-source-alert'
import { ReplaceCalendarLinkAlert } from './replace-calendar-link-alert'
import { RevokeInviteAlert } from './revoke-invite-alert'

export const {
  pushModal: pushAlert,
  popModal: popAlert,
  ModalProvider: AlertProvider,
} = createPushModal({
  Wrapper: AlertDialog,
  modals: {
    deleteSource: DeleteSourceAlert,
    deleteCalendar: DeleteCalendarAlert,
    replaceCalendarLink: ReplaceCalendarLinkAlert,
    revokeInvite: RevokeInviteAlert,
  },
})
