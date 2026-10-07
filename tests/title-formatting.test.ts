import { describe, expect, it } from 'vitest'
import {
  formatTitle,
  type TitleRule,
  titleFormattingFromPrefix,
  titleFormattingSchema,
  titleRuleSchema,
} from '../packages/db/src/title-formatting'

const home: TitleRule = {
  id: 'home',
  name: 'Home matches',
  enabled: true,
  caseSensitive: false,
  match: [
    { kind: 'text', value: 'Djurgården - ' },
    { kind: 'capture', id: 'opponent', name: 'Opponent', type: 'text' },
  ],
  show: [
    { kind: 'text', value: 'H: ' },
    { kind: 'reference', captureId: 'opponent', format: 'original' },
  ],
}
const away: TitleRule = {
  ...home,
  id: 'away',
  name: 'Away matches',
  match: [home.match[1], { kind: 'text', value: ' - Djurgården' }],
  show: [{ kind: 'text', value: 'A: ' }, home.show[1]],
}

describe('title formatting', () => {
  it('captures multi-word opponents, matches either side, and wraps renamed or unchanged titles', () => {
    const settings = { before: '⚽ ', after: '!', rules: [home, away] }
    expect(formatTitle('Djurgården - IFK Göteborg', settings).title).toBe('⚽ H: IFK Göteborg!')
    expect(formatTitle('AIK - Djurgården', settings).title).toBe('⚽ A: AIK!')
    expect(formatTitle('Training', settings).title).toBe('⚽ Training!')
    expect(formatTitle('djurgården  -   Malmö FF', settings).captures[0]?.value).toBe('Malmö FF')
  })
  it('only replaces the exact comma and uses the first enabled rule against the original title', () => {
    const blocked: TitleRule = {
      ...home,
      id: 'blocked',
      match: [{ kind: 'text', value: ',' }],
      show: [{ kind: 'text', value: 'Blockad' }],
    }
    expect(formatTitle(',', { before: '', after: '', rules: [blocked] }).title).toBe('Blockad')
    expect(formatTitle(', meeting', { before: '', after: '', rules: [blocked] }).title).toBe(
      ', meeting',
    )
    const next = {
      ...blocked,
      id: 'second',
      match: [{ kind: 'text' as const, value: 'Blockad' }],
      show: [{ kind: 'text' as const, value: 'Changed again' }],
    }
    expect(formatTitle(',', { before: '', after: '', rules: [blocked, next] }).title).toBe(
      'Blockad',
    )
    expect(
      formatTitle('Djurgården - AIK', {
        before: '',
        after: '',
        rules: [
          { ...home, enabled: false },
          { ...home, id: 'second', show: [{ kind: 'text', value: 'Match' }] },
        ],
      }).matchedRule?.id,
    ).toBe('second')
  })
  it('reorders and repeats captures, preserves accents, and defines the first delimiter as the boundary', () => {
    const reverse: TitleRule = {
      ...home,
      match: [
        { kind: 'capture', id: 'host', name: 'Home', type: 'text' },
        { kind: 'text', value: ' - ' },
        { kind: 'capture', id: 'visitor', name: 'Away', type: 'text' },
      ],
      show: [
        { kind: 'reference', captureId: 'visitor', format: 'upper' },
        { kind: 'text', value: ' / ' },
        { kind: 'reference', captureId: 'host', format: 'original' },
        { kind: 'text', value: ' / ' },
        { kind: 'reference', captureId: 'visitor', format: 'lower' },
      ],
    }
    expect(
      formatTitle('Djurgården - Malmö FF', { before: '', after: '', rules: [reverse] }).title,
    ).toBe('MALMÖ FF / Djurgården / malmö ff')
    expect(
      formatTitle('Team - Another - Extra', {
        before: '',
        after: '',
        rules: [reverse],
      }).captures.map((capture) => capture.value),
    ).toEqual(['Team', 'Another - Extra'])
  })
  it('treats punctuation as literal and respects constraints, case and complete-title matching', () => {
    const digits: TitleRule = {
      ...home,
      caseSensitive: true,
      match: [
        { kind: 'text', value: '[Shift]+ ' },
        { kind: 'capture', id: 'opponent', name: 'Number', type: 'digits' },
      ],
    }
    const settings = { before: '', after: '', rules: [digits] }
    expect(formatTitle('[Shift]+ 123', settings).title).toBe('H: 123')
    for (const title of [
      '[shift]+ 123',
      'x[Shift]+ 123',
      '[Shift]+ ',
      '[Shift]+ two',
      '[Shift]+ 123x',
    ])
      expect(formatTitle(title, settings).matchedRule).toBeUndefined()
    expect(
      formatTitle('Djurgården - IFK Göteborg', {
        ...settings,
        rules: [
          {
            ...home,
            match: [
              home.match[0],
              { kind: 'capture', id: 'opponent', name: 'Opponent', type: 'word' },
            ],
          },
        ],
      }).matchedRule,
    ).toBeUndefined()
    expect(formatTitle('x'.repeat(100_000), { ...settings, rules: [home] }).title).toHaveLength(
      100_000,
    )
  })
  it('rejects ambiguous captures, dangling references, duplicate identities and empty replacement titles', () => {
    for (const rule of [
      {
        ...home,
        match: [
          home.match[1],
          { kind: 'text', value: '' },
          { kind: 'capture', id: 'other', name: 'Other', type: 'text' },
        ],
      },
      { ...home, show: [{ kind: 'reference', captureId: 'missing', format: 'original' }] },
      { ...home, show: [{ kind: 'text', value: '' }] },
      { ...home, match: [home.match[1], { kind: 'text', value: '-' }, home.match[1]] },
    ])
      expect(titleRuleSchema.safeParse(rule).success).toBe(false)
    expect(
      titleFormattingSchema.safeParse({ before: '', after: '', rules: [home, home] }).success,
    ).toBe(false)
    expect(formatTitle('Fotboll', titleFormattingFromPrefix('⚽')).title).toBe('⚽ Fotboll')
  })
})
