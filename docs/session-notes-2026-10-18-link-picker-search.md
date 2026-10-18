# Session notes 2026-10-18: link picker search hidden on phones

Reported by the director with an iPhone screenshot: Announcements, "Add a
link", showed only the standing Pages list and no search box.

## Cause

The search row was never removed. `LinkPicker` is rendered inside the
announcement form, and its `.dir-search-overlay` (`position: fixed`) was
resolving against that drawer instead of the viewport. On a phone the
director header sat on top of the picker's first row, which is the search
input.

## Fix (PR #190)

`LinkPicker` now renders through `createPortal(..., document.body)`, so the
overlay is fixed to the viewport and sits above the shell at every width.

## Rule going forward

Any full-screen overlay that can be opened from inside a drawer or form
should portal to `document.body`. A fixed overlay nested in a drawer looks
fine on a laptop and loses its top row on a phone (#one-nav: check 375px).

Verified: `tsc -b`, eslint, `npm run build` clean. Not tested on a device
by me; the director confirmed it on their phone.
