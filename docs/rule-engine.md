# Rule engine catalogue, version 1.0.0

The pure engine imports no database, UI or network client. Input: a validated requirement and session ID. Output: ordered case objects. Logical order and values are fixed; IDs include the supplied session ID and requirement ID. Timestamps vary unless explicitly supplied. Reproducibility compares logical data excluding session identifiers and time. No random values or generated external data are used.

| Rule         | Applicability                            | Algorithm / output                                                                                                                                                               |
| ------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EP-VALID     | All types                                | Select a fixed valid representative: bounded length up to 12; numeric zero clamped to representable bounds; first allowed enum; true; earliest allowed date or fixed 2024-06-15. |
| EP-EMPTY     | All                                      | Empty string; invalid when required, valid otherwise. Empty bypasses all other constraints.                                                                                      |
| EP-TYPE      | All                                      | Wrong primitive, nonnumeric string, invalid calendar date, or string true for boolean.                                                                                           |
| EP-FORMAT    | Email or declared format                 | Malformed email string or exclamation marks for alphanumeric.                                                                                                                    |
| EP-ENUM      | Enumerated                               | Each allowed value in declared order and a sentinel guaranteed to be disallowed.                                                                                                 |
| EP-BOOLEAN   | Boolean                                  | Both native true and false.                                                                                                                                                      |
| EP-PRECISION | Decimal                                  | A value with one extra fractional digit; also an off-grid value when step exceeds the smallest precision unit.                                                                   |
| BVA-LENGTH   | Text, password, email with length limits | Each min/max length minus one, exact, plus one; omit negative lengths.                                                                                                           |
| BVA-NUMBER   | Integer/decimal numeric bounds           | Each min/max minus step, exact, plus step; integer step is one.                                                                                                                  |
| BVA-DATE     | Dates with limits                        | Each date bound minus one calendar day, exact, plus one calendar day.                                                                                                            |

Emission order is the catalogue order above. Within BVA rules: minimum before maximum, offsets -1, 0, +1. Project generation sorts requirements by ID. Password 8–20 includes lengths 7, 8, 9, 12, 19, 20, 21 and empty/wrong-type partitions.

## Constraint semantics and limits

- Types: text, email, password, integer, decimal, date, boolean, enum. Each requirement models a single field.
- Length counts Unicode code points, not bytes. Generated strings are ASCII. Limits: 0–1024 characters; required strings cannot have maximum zero.
- Email uses an explicitly documented ASCII subset: alphanumeric local segments separated by dot/underscore/plus/hyphen, a domain and alphabetic suffix of at least two letters. It is not a full RFC mailbox parser. Minimum representable length is six (a@b.co). Password strength classes and arbitrary regex are unsupported and rejected.
- Alphanumeric is ASCII A–Z, a–z, 0–9. No trimming or implicit type coercion occurs when assessing case input.
- Integer/numeric bounds must be within ±1e9. Decimal precision is required, 0–6; step defaults to 10^-precision. Step must be positive, ≤1e6 and representable at precision. The step lattice is anchored at zero, including when a declared bound is off-grid. Decimal boundary arithmetic uses scaled integers; shared assessment uses a 1e-6 scaled-unit tolerance for binary rounding. Additional precision is invalid.
- Date is a real YYYY-MM-DD calendar date, supported definition years 1000–9998. UTC calendar setUTCDate handles leap days, month and year transitions without assuming every day is a fixed local millisecond duration.
- Numeric/date exclusive bounds reject equality. Impossible intervals with no representable valid value are rejected.
- Enums contain 1–30 unique nonempty strings of at most 100 characters. Booleans accept only native booleans; string true/false and numbers are invalid.
- Empty string/null/undefined is treated as absence; optional absence is valid even with length or range constraints. Generated absence uses the empty string because JSON cannot represent undefined. Optional maxLength zero has only the empty valid partition.
- Unknown properties, unsupported format strings, contradictory bounds and precision mismatches are rejected. No hidden constraint interpretation.
- Generation selects ≤50 requirements and ≤2500 cases. Per-request JSON is streamed with a 256 KiB cap. No Cartesian products or unbounded combinations are generated. Database storage/list views show the latest 100 projects/sessions/evaluations and up to 1000 live requirements per project; historical session cases are retrieved in pages. Archive older projects when these UI listing limits matter.

Case schema: id, requirementId, sessionId, title, description, category, technique, input, preconditions[], steps[], expectedValid (boolean), expectedResult, constraintIds[], ruleId, ruleVersion, objective, generatedAt. Boundary is a category separate from positive/negative; expectedValid states which outcome applies. A boundary case may violate another simultaneous constraint; expected outcome is always overall requirement validity, and its objective identifies the particular bound it probes.
