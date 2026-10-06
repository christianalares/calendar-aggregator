import { mutationOptions as defineMutation } from '@tanstack/react-query'
import { queryOptions } from '../queries'
import { serverFns } from '../server-fns'

export const mutationOptions = {
  sources: {
    save: (ownerId: string) =>
      defineMutation({
        mutationFn: serverFns.sources.save,
        onSuccess: async (_data, _variables, _result, context) => {
          await context.client.invalidateQueries(queryOptions.calendars.list(ownerId))
          await context.client.invalidateQueries({ queryKey: ['outputs', ownerId] })
        },
      }),
    remove: (ownerId: string) =>
      defineMutation({
        mutationFn: serverFns.sources.remove,
        onSuccess: async (_data, _variables, _result, context) => {
          await context.client.invalidateQueries(queryOptions.calendars.list(ownerId))
          await context.client.invalidateQueries({ queryKey: ['outputs', ownerId] })
        },
      }),
    check: (ownerId: string) =>
      defineMutation({
        mutationFn: serverFns.sources.check,
        onSuccess: async (_data, _variables, _result, context) => {
          await context.client.invalidateQueries(queryOptions.calendars.list(ownerId))
          await context.client.invalidateQueries({ queryKey: ['outputs', ownerId] })
        },
      }),
  },
  outputs: {
    save: (ownerId: string) =>
      defineMutation({
        mutationFn: serverFns.outputs.save,
        onSuccess: async (_data, _variables, _result, context) => {
          await context.client.invalidateQueries(queryOptions.calendars.list(ownerId))
          await context.client.invalidateQueries({ queryKey: ['outputs', ownerId] })
        },
      }),
    remove: (ownerId: string) =>
      defineMutation({
        mutationFn: serverFns.outputs.remove,
        onSuccess: (_data, _variables, _result, context) =>
          context.client.invalidateQueries(queryOptions.calendars.list(ownerId)),
      }),
    rotate: (ownerId: string) =>
      defineMutation({
        mutationFn: serverFns.outputs.rotate,
        onSuccess: (_data, _variables, _result, context) =>
          context.client.invalidateQueries(queryOptions.calendars.list(ownerId)),
      }),
  },
}
