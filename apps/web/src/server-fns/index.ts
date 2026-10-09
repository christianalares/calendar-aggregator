import { currentUser, signInStatus } from './auth'
import {
  listCalendars,
  previewFilters,
  removeOutput,
  removeSource,
  rotateOutput,
  saveOutput,
  saveSource,
} from './calendars'
import { checkSource, previewOutput } from './feeds'
import { createInvitation, listInvitations, revokeInvitation } from './invitations'

export const serverFns = {
  auth: { currentUser, signInStatus },
  invitations: { create: createInvitation, list: listInvitations, revoke: revokeInvitation },
  calendars: { list: listCalendars },
  sources: { save: saveSource, remove: removeSource, check: checkSource, previewFilters },
  outputs: { save: saveOutput, remove: removeOutput, rotate: rotateOutput, preview: previewOutput },
}

type InputMap<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => unknown
    ? A[0] extends { data: infer D }
      ? D
      : A[0]
    : InputMap<T[K]>
}
type OutputMap<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => infer R ? Awaited<R> : OutputMap<T[K]>
}
export type MutationInput = InputMap<typeof serverFns>
export type MutationOutput = OutputMap<typeof serverFns>
