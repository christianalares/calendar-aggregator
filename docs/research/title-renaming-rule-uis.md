# Compact event title rules: UI precedents

Research date: 2026-10-07. These observations come from current first-party documentation and linked UI illustrations. They are not the result of hands-on usability testing. Recommendations below are design proposals, not implemented behavior or accepted specifications.

## Observations

### 1. Hazel: visual patterns plus named captures

Hazel is the closest precedent. A matching condition's field opens a pattern popover. The pattern combines typed literal text with blue token bubbles. Users can click a token to insert it or drag it into position. Built-in tokens cover words, numbers, characters, and arbitrary text. The default match operation covers the entire attribute; partial matching is a separate operation. Its match patterns are case insensitive. [Source: Using Match Patterns in Conditions](https://www.noodlesoft.com/manual/hazel/attributes-actions/attribute-reference/using-match-patterns-in-conditions/).

A custom text token opens a second popover where the user gives it a name and defines what it matches. The token then appears under that name in later conditions and action patterns within the same rule. At runtime it carries the actual matched text. This makes a capture a reusable object rather than punctuation such as `$1`. [Source: Custom Text Attributes](https://www.noodlesoft.com/manual/hazel/attributes-actions/attribute-reference/using-custom-attributes/custom-text-attributes/).

The rename action has another pattern composer. Hazel's documented example captures a report's quarter and year, then rearranges those custom tokens to construct a different filename. The output composer supports literal text between tokens and token-specific formatting menus. [Source: Using Custom Attributes in Actions](https://www.noodlesoft.com/manual/hazel/attributes-actions/action-reference/using-patterns-in-actions/using-custom-attributes-in-actions/).

Its live rule preview uses a selected real file. It displays overall match status, a green check or red X for each condition, and a popover exposing current attribute values and custom captures. Match status updates while editing. Important limitation: preview checks conditions; it explicitly does not execute the rule's actions. A calendar title editor can go further by showing the resulting title because that transformation is cheap and reversible. [Source: Preview a Rule](https://www.noodlesoft.com/manual/hazel/work-with-folders-rules/create-edit-rules/preview-a-rule/).

**Useful interaction:** literal text and named captures in the same short field, with details in a popover. **Tradeoff:** Hazel's nested popovers and broad token catalog introduce complexity beyond a calendar's needs.

### 2. Apple Shortcuts: output variables as inline pills

Shortcuts represents variables as blue pills. Selecting a text field exposes variable insertion controls. “Select Variable” reveals available action outputs; selecting one inserts its pill at the original text insertion point. Static text and variable pills can therefore compose one value. [Source: Use variables in Shortcuts](https://support.apple.com/en-euro/guide/shortcuts/apdd02c2780c/ios).

**Useful interaction:** insert a capture into the new title at the caret, instead of asking users to type a placeholder syntax. **Limitation:** this documentation describes using variables, not a visual editor that creates text captures. It supports the output composer analogy, not an assertion that Shortcuts has Hazel-style visual matching.

### 3. Make: mapped values and visible provenance

Make's Text parser has a Match pattern module with a regex field and separate controls for global matching, case sensitivity, and multiline behavior. Capturing parentheses are required for extracted output items. Its separate Replace module has pattern and new-value fields. This is a technically powerful precedent but the matching input still requires regex knowledge. [Source: Text parser](https://help.make.com/regexp).

In Make's mapping workflow, clicking an input field opens available data. Clicking a value inserts a labeled box in the field. Hovering a mapped item pulses its source module. A module's run output can be opened and expanded to inspect available data before mapping it. [Source: Mapping](https://help.make.com/mapping).

**Useful interaction:** output tokens retain a visible connection to their source. In our case, hovering an “Opponent” pill could highlight the corresponding captured input span. **Tradeoff:** Make is a multi-module workflow editor; reproducing its canvas and mapping panel would overwhelm this much smaller task. The parser docs do not establish support for named captures, so that capability is not assumed here.

### 4. Keyboard Maestro: compact search/replace with advanced settings

Keyboard Maestro puts the search type in a pop-up: literal or regex, with case-sensitive and case-insensitive variants. Its replacement text field has an insertion arrow for variables and other tokens. Regex capture references can be numeric or named. A gear menu controls replacing all matches, the first match, or the last match. There is a subtle limitation: expanded variable contents are not expanded recursively, so a variable containing `$1` does not become a capture reference automatically. [Source: Search and Replace](https://wiki.keyboardmaestro.com/action/Search_and_Replace).

**Useful interaction:** keep secondary matching options under a small settings menu. **Tradeoff:** its raw regex and capture-reference syntax remains a poor default for this feature.

## Recommendations for this calendar editor

These are design inferences from the precedents, combined with the user's examples.

Use one unified pattern language with two adjacent composers: **Match title** and **Show as**. Literal-only patterns handle the exact comma case without adding a separate capture workflow. Named capture pills handle variable text. Collapsed rules can be a compact left-to-right row; editing can expand that same row in place.

```text
Match title                          Show as
","                                  "Blockad"
Djurgården - [Opponent]               H: [Opponent]
[Opponent] - Djurgården               A: [Opponent]
[Home team] - [Away team]             [Away team] at [Home team]
```

The brackets above depict actual pills, not syntax the user must learn. “Opponent” should capture text containing spaces, accents, and punctuation, so names such as “IFK Göteborg” remain intact.

Two capture creation paths are useful:

1. **From an example:** pick an existing event, select `AIK`, and choose “Capture this”. Suggest “Opponent” as a name, while allowing editing. Replace that example span with the pill. This is a proposed shortcut; none of the inspected sources establish exactly this interaction.
2. **Direct composition:** click “Add capture” at the caret. Supply a default name and open a small popover to rename it or choose the captured text type. Allow plain typing around the pill.

Initially offer text, word, and number capture types; keep more constraints behind a pill popover. “Text” is the useful default. The output's insert menu should offer only captures that this rule defines, plus the original title if desired. Give matching and output instances of a capture the same visual identity. Hover or focus can reveal its value in the selected example.

Keep a before → after preview below the active rule and a compact “matches 6 of 12 examples” count. Include nonmatching examples and show “unchanged” explicitly. An optional expanded preview table can reveal which rule wins for each event. This catches accidental matches far better than previewing one successful string.

Proposed semantics: full-title matching by default; a capture consumes nonempty text up to the next literal separator, or to the title's end when last. Exact characters outside captures are literal. Reject adjacent unconstrained captures because their boundary is undefined. Spaces and case tolerance should be explicit controls rather than invisible magic. Where a delimiter occurs repeatedly, expose or explain the chosen boundary in preview; do not silently present an ambiguous capture as unambiguous. These are engine decisions requiring agreement before implementation.

Use ordered rules with the first matching enabled rule winning. This is a proposed calendar-specific policy, not a finding about all products above. Keep the winner visible in the preview. Store literal and capture segments structurally rather than parsing whatever placeholder characters happen to be typed; this lets names change without breaking references and allows real braces or percent signs in event titles.

The visual matcher should be powerful enough for these examples. Raw regex can remain an optional advanced rule type later. Converting an arbitrary regex back into this visual editor is not reliably lossless, so avoid promising a universal visual/regex toggle.

## What this research does not establish

- No user testing proves that a pill composer will be understandable to this app's users. The next step is trying the interactive prototype with the two actual event cases.
- No production data was inspected to discover punctuation variants, whitespace, or prefixes in the football titles.
- No live product UI was tested; specific interactions are grounded in official documentation. Visual styling and responsive behavior still need prototype evaluation.
