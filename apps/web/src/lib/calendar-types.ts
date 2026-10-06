import type { MutationOutput } from '@/server-fns'

type Calendars = MutationOutput['calendars']['list']
export type Source = Calendars['sources'][number]
export type Output = Calendars['outputs'][number]
