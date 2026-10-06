# Calendar Aggregator

A service for combining selected external calendar subscriptions into read-only subscription feeds.

## Language

**Source subscription**:
An external calendar subscription managed by a calendar owner, whose events can be included in that owner's output calendars.
_Avoid_: Output, shared editable calendar

**Output calendar**:
A read-only calendar containing events from source subscriptions selected by its calendar owner, which can be shared with subscribers.
_Avoid_: Source subscription, shared editable calendar

**Title prefix**:
Optional text prepended to event titles from a particular source within a particular output calendar. The same source can have different prefixes in different outputs.

**Calendar owner**:
The person who creates an output calendar and controls its included sources and settings.
_Avoid_: Subscriber

**Subscriber**:
A person who receives an output calendar's events through a calendar subscription, without control over its sources or settings.
_Avoid_: Calendar owner, collaborator

**Service operator**:
The person who controls admission to the service by inviting people to create accounts.
_Avoid_: Calendar owner, subscriber

**Invitation**:
A single-use link associated with the account that created it and shared manually to admit a new account holder. It has no time-based expiry and can be redeemed by whoever possesses it.
_Avoid_: Subscription URL

**Subscription URL**:
A private URL that grants read access to one output calendar to anyone who possesses it, without requiring a service account.
_Avoid_: Invitation, source subscription URL

**Last known good data**:
The calendar data from a source subscription's most recent successful fetch, retained for use when subsequent fetches fail.
_Avoid_: Empty fallback

**Filter**:
A rule that selects events from a source subscription according to event properties, such as title or location.
