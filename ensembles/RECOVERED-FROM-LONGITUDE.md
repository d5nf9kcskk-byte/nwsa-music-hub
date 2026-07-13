# Ensembles Hub — recovered from the `longitude` repo

This directory is a **static, standalone vanilla HTML/CSS/JS app** — the
"NWSA Music Ensembles Hub" (a light student/family side plus a dark
**Director Panel** behind `#/d/…`, with data kept in the director's
browser `localStorage`). It is **not** part of the React/TypeScript app in
`src/`; nothing here is imported by or wired into the Vite build.

## Why it's here

This work was built on **2026-07-12** but was committed and pushed to the
wrong repository — `d5nf9kcskk-byte/longitude` (Grant's personal hub),
under branch `claude/director-panel-ui-sclhnq` — instead of
`nwsa-music-hub`. The next day it was "evicted" (deleted) from that repo
with the stated intent that it "moves wholesale to the new nwsa-music-hub
repository," but that move was never completed.

These files were recovered verbatim from the last commit in `longitude`
that still contained them: `7065f0d` ("Fully separate Longitude and the
Ensembles Hub — no interaction"), the parent of the eviction commit
`84d1973`.

## Status: parked for review — NOT yet reconciled

`nwsa-music-hub` already contains a **React/TypeScript** Director Panel and
student site under `src/director/` and `src/public/`, backed by Firestore.
This recovered app is a **parallel, from-scratch reimplementation** of the
same product in a different stack (vanilla JS + localStorage). The two have
**not** been merged. This copy is preserved here so the day's work is safe
in the correct repository; how to reconcile the two implementations is an
open decision for the project owner.
