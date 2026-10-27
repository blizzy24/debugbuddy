# Engineering Report

## Executive Summary
Checkout fails silently on Safari 17 when a saved card is selected. The submit request is never sent, so no order is created.

**Severity:** High  ·  **Likely subsystem:** payments  ·  **Category:** functional  ·  **Readiness:** 78/100

## Observed Facts
- Clicking **Pay now** does nothing on Safari 17.2 (macOS)
- Works in Chrome with the same account
- No error message is shown to the user

## Working Hypothesis
_This is a hypothesis, not a confirmed cause._

A promise rejection in the `onSubmit` handler is swallowed when the saved-card token is *stale*.

## Recommended First Checks
1. Reproduce on Safari 17 with a saved card
2. Check the network tab for a `POST /api/checkout` request

## Investigation Checklist
- [ ] Add logging around the saved-card branch
- [x] Confirm the issue is Safari-only

## Still Missing
- Exact Safari build number

## Next Best Question
Does the problem also happen with a newly added card?

---
_Produced after 3 rounds of questions without reaching the readiness threshold (score 78/100). The gaps above are still open._
