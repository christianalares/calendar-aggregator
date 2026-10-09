import { queryOptions as defineQuery } from '@tanstack/react-query'
import { type MutationInput, serverFns } from '../server-fns'

export const queryOptions = {
  auth: {
    currentUser: () =>
      defineQuery({
        queryKey: ['auth', 'current-user'],
        queryFn: serverFns.auth.currentUser,
        staleTime: 0,
        retry: false,
      }),
    status: (invitation?: string) =>
      defineQuery({
        queryKey: ['auth', 'status', invitation],
        queryFn: () => serverFns.auth.signInStatus({ data: { invitation } }),
      }),
  },
  invitations: {
    list: (ownerId: string) =>
      defineQuery({ queryKey: ['invitations', ownerId], queryFn: serverFns.invitations.list }),
  },
  calendars: {
    list: (ownerId: string) =>
      defineQuery({ queryKey: ['calendars', ownerId], queryFn: serverFns.calendars.list }),
  },
  sources: {
    filterPreview: (ownerId: string, data: MutationInput['sources']['previewFilters']) =>
      defineQuery({
        queryKey: ['filter-preview', ownerId, data],
        queryFn: () => serverFns.sources.previewFilters({ data }),
        staleTime: 0,
        retry: false,
      }),
  },
  outputs: {
    preview: (ownerId: string, id: string) =>
      defineQuery({
        queryKey: ['outputs', ownerId, id, 'preview'],
        queryFn: () => serverFns.outputs.preview({ data: { id } }),
        staleTime: 60_000,
      }),
  },
}

export type QueryInput = {
  [D in keyof typeof queryOptions]: {
    [K in keyof (typeof queryOptions)[D]]: (typeof queryOptions)[D][K] extends (
      ...args: infer A
    ) => unknown
      ? A[0]
      : never
  }
}

type QueryFactories = typeof queryOptions
export type QueryOutput = {
  [D in keyof QueryFactories]: {
    [K in keyof QueryFactories[D]]: QueryFactories[D][K] extends (...args: never[]) => {
      queryFn?: infer F
    }
      ? F extends (...args: never[]) => infer R
        ? Awaited<R>
        : never
      : never
  }
}
