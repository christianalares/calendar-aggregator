# UI foundation

The application uses shadcn/ui with **Base UI**, Tailwind CSS v4, and the Nova/neutral
starter configuration, customized with CalPal's first theme and dashboard layout.
The original font, color direction, and reference images are saved in
[the theme capture](inbox/20261006T132719Z-c1cf2c42.md).

## Adding components

Run the shadcn CLI in the existing web app:

```sh
pnpm --filter @calendar-aggregator/web ui:add <component>
```

`apps/web/components.json` selects `base-nova`, local `@/` aliases, and
`src/styles.css` as the CSS entry. Keep generated components in `src/components/ui`
and adapt them to the repository's formatting/lint rules. Tailwind is integrated
through `@tailwindcss/vite`; no separate Tailwind config or PostCSS setup is needed.

The installed primitives cover forms, cards, tables, action menus, dialogs,
confirmations, sheets, popovers, and a small read-only month preview. There is no
new data-table framework or full calendar application package. The preview shows
up to 40 raw feed entries at their start dates, with a selected-day list and an
all-entries view. It does not expand recurrence or infer multi-day coverage; the
subscriber’s calendar app handles the complete feed.

## Overlays

Use the Vitalplus registry structure with the same `pushmodal` package:

- `src/components/modals/index.tsx`: `pushModal`, `popModal`, `ModalProvider`.
- `src/components/sheets/index.tsx`: `pushSheet`, `popSheet`, `SheetProvider`.
- `src/components/alerts/index.tsx`: `pushAlert`, `popAlert`, `AlertProvider`.

All three providers are mounted in the root. Existing source/calendar forms and
event preview use modals. Source/calendar deletion, link replacement, and invite
revocation use alerts. The sheets registry is empty until a sheet feature exists.
Keep overlay components in their respective directories and return the matching
`DialogContent`, `SheetContent`, or `AlertDialogContent`. Do not add local open-state
flags or inline dialog definitions to dashboard components.

Import `createPushModal` from `pushmodal/base-ui` (PushModal 1.1.0). Modal
registrations use shorthand components with the package's Base UI `Dialog.Root`.
The alerts registry supplies `Wrapper: AlertDialog` at the factory level, and the
sheets registry supplies `Wrapper: Sheet`. Individual registrations can still
provide a wrapper override when needed.

```tsx
import { createPushModal } from 'pushmodal/base-ui'

const { pushModal, popModal, ModalProvider } = createPushModal({
  modals: { source: SourceModal },
})

pushModal('source', { ownerId })
popModal('source')
```

The package now supplies matching Base UI context directly, so local mount-state
wrappers are unnecessary. The original `pushmodal` entry still defaults to Radix;
use the Base UI entry for application overlays. Radix remains a required package
peer for backward compatibility and is installed automatically by pnpm, but the
Base UI entry loads no Radix runtime or declaration dependency.

`pushmodal` retains closed entries for 300 ms, so keep exit transitions below that
duration (dialogs use 100 ms, sheets 200 ms). Mutation errors stay in the overlay
so the owner can retry; confirmation actions close only after a successful
mutation and query invalidation.

The Base UI entry also exports `createResponsiveWrapper` with inferred root and
content props for the supplied primitives. It is available if responsive
dialog/sheet switching is introduced later.

## Theme and layout

`theme.css` owns semantic light/dark colors, and `styles.css` maps them to Tailwind.
The palette follows the supplied dashboard/calendar references: a cool gray canvas,
white cards, dark navy ink, vivid blue actions, and pale blue, cyan, peach, rose,
violet, and mint source labels. Dark mode uses neutral charcoal surfaces and deeper
category fills with lighter matching text. `SourceBadge` and `SourceMarker` derive
the same stable color from a source ID wherever it appears; colors identify sources,
not inferred event categories. Mint, yellow, and red communicate health/warnings/errors.
Nunito headings add rounded character, while Nunito Sans keeps body text readable.
Primary hover colors are explicit to preserve text contrast instead of fading buttons.
Fonts are self-hosted through Fontsource. `next-themes` supports persisted Light,
Dark, and System appearance, with the provider covering pages and portalled overlays.

The legacy stylesheet and root scope have been removed. All visible routes now use
Tailwind and shadcn primitives. `SectionHeader` keeps titles, counts, and primary
create actions consistent. Calendar cards use `auto-fit` with a 19rem minimum that
shrinks safely on narrow screens; eight calendars become three, two, or one column.
Sources and operator-only invitations use ordinary shadcn tables. Narrow screens
scroll within each table, preserving the source fields without overflowing the page.
Source Check/Edit/Delete and calendar Edit/Replace link/Delete use Base UI menus.

## Verification

Use `pnpm check-types`, `pnpm lint`, and `pnpm test:browser`. The browser suite builds
the application and uses an isolated temporary PostgreSQL database. It exercises
the real dashboard on desktop and iPhone, including overlay focus/close behavior,
failed saves, source menu-to-modal interactions, subscription/invitation mutations,
eight-calendar layouts, source health states, and persisted dark mode.

References: [shadcn installation](https://ui.shadcn.com/docs/installation/tanstack),
[Base UI default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default),
[pushmodal custom wrappers](https://github.com/lindesvard/pushmodal),
[Base UI dialog API](https://base-ui.com/react/components/dialog).
