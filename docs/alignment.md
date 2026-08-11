# Cross-provider episode alignment

Provider episode numbers are not stable identities. Some catalogs split a two-part broadcast
while another catalog represents it as one episode; some also publish duplicate episode numbers.
GraphTV therefore aligns supplemental episodes conservatively before merging ratings or metadata.

## Invariants

- Every supplemental rating attached to a primary episode records the provider episode ID, matching
  strategy, confidence, and evidence that justified it.
- Matching is one-to-one. An ambiguous or unmatched episode contributes no supplemental data.
- A missing provider record and a matched provider record with an `N/A` rating remain distinct.
- Wrong data is worse than missing data. The matcher does not use fuzzy title distance, inferred
  numbering offsets, or cross-season matching.
- Matching is deterministic and independent of locale, timezone, and input ordering.

## Evidence order

Within each season, the matcher consumes unique pairs in this order:

1. Exact normalized title and exact air date.
2. Exact normalized title.
3. Parsed base title, explicit part number, and exact air date.
4. Parsed base title and explicit part number.
5. Parsed base title and exact air date.
6. Exact air date.

Titles use Unicode normalization, case folding, punctuation removal, and whitespace collapsing.
Terminal part markers such as `(2)`, `Part II`, and `Pt. 2` are parsed from the title before
punctuation is removed. Bare trailing numbers are not treated as markers. A title consisting only of
a part marker does not supply base-title evidence.

Explicit unequal part indices never match under any strategy. A missing part marker on one side is
compatible with an explicit marker on the other, but discarding that marker produces strong evidence
only when corroborated by an exact air date. More generally, a match is strong when title identity is
established exactly, or when base-title identity is corroborated by either the same explicit part
index or an exact air date. Date-only matches remain moderate and are excluded from ratings charts.

Dates are normalized by providers to `YYYY-MM-DD` strings. Episode number is retained for display
and diagnostics but is not used as identity evidence.

Combined episodes are intentionally not copied onto multiple split parts. Doing so would count one
provider measurement twice in averages and trendlines. The split parts remain unmatched and are
reported in alignment diagnostics.

## OMDb vote counts

OMDb season responses provide episode ratings but omit vote counts. GraphTV requests the individual
episode record only after the user explicitly selects an episode with a strong OMDb match (or an
episode from OMDb as the primary provider).
Requests are debounced, cached for 14 days, limited to 25 per page view and 250 per browser per UTC
day, and aborted when the chart is destroyed. The episode response must identify the expected parent
series before its vote count is accepted.

Transient failures are cached for one minute so repeatedly selecting an episode cannot rapidly consume
the request budget. Partial season-batch failures preserve successful seasons and are recorded in the
provider diagnostics with the failed season numbers and reasons.

OMDb may return a vote count while reporting the rating itself as `N/A`. GraphTV preserves that state
and displays both facts rather than fabricating or borrowing a score.
