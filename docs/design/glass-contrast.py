#!/usr/bin/env python3
"""Composite the REAL glass stack and report WCAG contrast for every text
colour on every surface, in every theme and both glass presets.

The stack, in paint order, is exactly what the browser does:

    page colour
      -> the ambient bloom lobes (.field::before, then .field::after at .7)
      -> the backdrop-filter on the chrome/hero tiers (saturate, brightness)
      -> the card tint at its alpha
      -> the top-weighted fill overlay (.tier-*::before)
      -> the travelling shine (.tier-*::after)

TWO DIFFERENT ARGUMENTS, ONE PER DIRECTION.

In the LIGHT presets the field is ADDITIVE: a fixed base tint deepens the
page, and every orb painted on it is BRIGHTER than that base.  So the
darkest pixel on the page is the base, full stop, and the orbs cannot make
anything worse no matter how strong they are.  The model therefore measures
the base alone, and separately ASSERTS that every orb colour has a
luminance at or above the base composite.  That assertion is the whole
safety argument for the light field, and it is far stronger than any alpha
budget, because it holds at any alpha.

In the DARK presets the field is subtractive in the sense that matters:
every orb LIGHTENS a near-black page under light text, so the orbs are the
worst case and are modelled directly, one at a time.

HOW MANY LOBES STACK (dark only).  The three radial gradients are centred far apart
relative to their own extents: lobe 1 at 18%/8% with a 44%x38% extent,
lobe 3 at 62%/32% with 40%x34%.  The horizontal gap between those two
centres is 44%, which is lobe 1's whole x-extent, and the gradient has
already faded to transparent at 70% of it.  So no two lobes meaningfully
overlap, and the worst any single pixel can see is ONE lobe.  `.field::after`
repaints the same three gradients at opacity .7 under a different
transform, so that one lobe can land twice: once at its alpha, once at
.7 of it.  That is the model: one lobe, two passes.  Measured against the
geometry it is conservative, because inside the visible screen the
strongest lobe only ever reaches about 77% of its nominal alpha.

Spotlight sets `.field::after { background: none }`, so there it is one
lobe, ONE pass.

TEXT IS NOT COMPOSITED WITH THE OVERLAY OR THE SHINE.  Both sit below the
text in paint order (`z-index: -1` inside a stacking context the card
makes).  That is load-bearing: the first draft painted the shine over the
text with `mix-blend-mode: overlay`, which doubles any channel under 0.5
and would have dragged muted grey up by 40 points while it swept past.
If the shine ever goes back above the text, composite it onto the text
side here too and these numbers drop.

Run:  python3 -I contrast.py [path-to-glass-sample.html]
Exit 1 if anything is under its bar, or if the model has drifted from
the stylesheet.
"""
import sys, pathlib

BAR = 4.5

# ───────────────────────── colour maths ─────────────────────────


def hx(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def over(top, alpha, bot):
    return tuple(b + alpha * (t - b) for t, b in zip(top, bot))


def saturate(rgb, s):
    """CSS filter: saturate(), i.e. the feColorMatrix saturate matrix."""
    r, g, b = rgb
    lr, lg, lb = 0.213, 0.715, 0.072
    rows = (
        (lr + s * (1 - lr), lg * (1 - s), lb * (1 - s)),
        (lr * (1 - s), lg + s * (1 - lg), lb * (1 - s)),
        (lr * (1 - s), lg * (1 - s), lb + s * (1 - lb)),
    )
    return tuple(max(0.0, min(255.0, w0 * r + w1 * g + w2 * b))
                 for w0, w1, w2 in rows)


def brightness(rgb, k):
    return tuple(max(0.0, min(255.0, c * k)) for c in rgb)


def chan(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lum(rgb):
    r, g, b = (chan(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


WHITE = (255, 255, 255)


def bloom(page, lobe_rgb, lobe_a, passes):
    if lobe_rgb is None:
        return page
    c = over(lobe_rgb, lobe_a, page)
    if passes > 1:
        c = over(lobe_rgb, lobe_a * 0.7, c)
    return c


def surface(page, lobe, passes, filt, tint_a, overlay_a, shine_a):
    c = bloom(page, lobe[0], lobe[1], passes)
    if filt:
        sat, bri = filt
        c = brightness(saturate(c, sat), bri)
    c = over(WHITE, tint_a, c)
    # NOTE: in light presets overlay_a and shine_a are passed as 0 on purpose.
    # See the patch note in the module docstring: each direction is modelled at
    # its own worst case, not at the same stack.
    if overlay_a:
        c = over(WHITE, overlay_a, c)
    if shine_a:
        c = over(WHITE, shine_a, c)
    return c


# ───────────────────────── the presets ─────────────────────────
# tiers:  name -> (filter|None, tint_a, overlay_a, shine_a)

LIGHT_TEXT = {
    'ink #18212F': hx('#18212F'),
    'muted #5D6773': hx('#5D6773'),
    'accent #0E7585': hx('#0E7585'),
    'plum #7B3578': hx('#7B3578'),
    'hall gold #7E6410': hx('#7E6410'),
}
DARK_TEXT = {
    'ink #E7ECF2': hx('#E7ECF2'),
    'muted #97A3B2': hx('#97A3B2'),
    'accent #3AA8B8': hx('#3AA8B8'),
    'plum #D7A2D3': hx('#D7A2D3'),
    'hall gold #D9B84A': hx('#D9B84A'),
}
SPOT_TEXT = {
    'ink #F3EEFF': hx('#F3EEFF'),
    'muted #D5CEE6': hx('#D5CEE6'),
    'gold #E4C968': hx('#E4C968'),
}

PRESETS = {}

PRESETS['light / Full'] = dict(
    page=over(hx('#101828'), .035, hx('#F4F6F8')), passes=1, text=LIGHT_TEXT,
    lobes={'base, no orb': (None, 0)},
    brighter_than=[hx('#D2F5FD'), hx('#F8ECF9'), hx('#FFF2B8'), (255, 255, 255)],
    tiers={
        'chrome hdr/tabs': ((1.90, 1.05), .14, 0, 0),
        'hero big card': ((1.80, 1.04), .17, 0, 0),
        'solid rows': (None, .30, 0, 0),
        'bare page': (None, 0, 0, 0),
    })

PRESETS['light / Subtle'] = dict(
    page=over(hx('#101828'), .035, hx('#F4F6F8')), passes=1, text=LIGHT_TEXT,
    lobes={'base, no orb': (None, 0)},
    brighter_than=[hx('#D2F5FD'), hx('#F8ECF9'), hx('#FFF2B8'), (255, 255, 255)],
    tiers={
        'chrome hdr/tabs': ((1.50, 1.02), .42, 0, 0),
        'hero big card': ((1.50, 1.02), .46, 0, 0),
        'solid rows': (None, .60, 0, 0),
        'bare page': (None, 0, 0, 0),
    })

PRESETS['dark / Full'] = dict(
    page=hx('#10151B'), passes=2, text=DARK_TEXT,
    lobes={'teal': (hx('#0E7585'), .13),
           'plum': (hx('#7B3578'), .12),
           'spark': ((255, 255, 255), .045)},
    tiers={
        'chrome hdr/tabs': ((1.80, 0.90), .022, .012, .018),
        'hero big card': ((1.80, 0.90), .026, .012, .018),
        'solid rows': (None, .040, .012, 0),
        'bare page': (None, 0, 0, 0),
    })

PRESETS['dark / Subtle'] = dict(
    page=hx('#10151B'), passes=2, text=DARK_TEXT,
    lobes={'teal': (hx('#0E7585'), .080),
           'plum': (hx('#7B3578'), .075),
           'spark': ((255, 255, 255), .025)},
    tiers={
        'chrome hdr/tabs': ((1.50, 0.95), .045, .012, .022),
        'hero big card': ((1.50, 0.95), .050, .012, .022),
        'solid rows': (None, .065, .012, 0),
        'bare page': (None, 0, 0, 0),
    })

# Spotlight: near black, ONE pass, and the strongest field in the sample.
PRESETS['spotlight / Full'] = dict(
    page=hx('#121018'), passes=1, text=SPOT_TEXT,
    lobes={'teal glow': (hx('#3AA8B8'), .38),
           'plum glow': (hx('#7B3578'), .48)},
    tiers={
        'chrome hdr/tabs': ((1.70, 0.92), .040, .020, .035),
        'hero big card': ((1.70, 0.92), .050, .020, .035),
        'solid rows': (None, .070, .020, 0),
        'bare page': (None, 0, 0, 0),
    })

PRESETS['spotlight / Subtle'] = dict(
    page=hx('#121018'), passes=1, text=SPOT_TEXT,
    lobes={'teal glow': (hx('#3AA8B8'), .30),
           'plum glow': (hx('#7B3578'), .38)},
    tiers={
        'chrome hdr/tabs': ((1.50, 0.95), .065, .020, .030),
        'hero big card': ((1.50, 0.95), .075, .020, .030),
        'solid rows': (None, .090, .020, 0),
        'bare page': (None, 0, 0, 0),
    })


# ───────── pin the model to the stylesheet so it cannot drift ─────────
PINS = [
    '--hub2-muted: #5d6773',
    '--hub2-accent-fill: #0e7585',
    '--hall-gold-text: #7e6410',
    # the light field floor, and the four orb colours asserted against it
    '--field-base: rgba(16,24,40,.035)',
    '--field-teal: rgba(210,245,253,.95)',
    '--field-plum: rgba(248,236,249,.92)',
    '--field-warm: rgba(255,242,184,.88)',
    '--field-spark: rgba(255,255,255,.9)',
    # light / Full
    '--glass-chrome: rgba(255,255,255,.14)',
    '--glass-hero: rgba(255,255,255,.17)',
    '--glass-solid: rgba(255,255,255,.30)',
    # light / Subtle
    '--field-teal: rgba(210,245,253,.60)',
    '--glass-chrome: rgba(255,255,255,.42)',
    '--glass-hero: rgba(255,255,255,.46)',
    '--glass-solid: rgba(255,255,255,.60)',
    # dark / Full
    '--field-teal: rgba(14,117,133,.13)',
    '--field-spark: rgba(255,255,255,.045)',
    '--glass-chrome: rgba(255,255,255,.022)',
    '--glass-hero: rgba(255,255,255,.026)',
    '--glass-solid: rgba(255,255,255,.04)',
    # dark / Subtle
    '--field-teal: rgba(14,117,133,.08)',
    '--field-spark: rgba(255,255,255,.025)',
    '--glass-chrome: rgba(255,255,255,.045)',
    '--glass-hero: rgba(255,255,255,.05)',
    '--glass-solid: rgba(255,255,255,.065)',
    # spotlight / Full
    '--glass-solid: rgba(255,255,255,.07)',
    '--glass-hero: rgba(255,255,255,.05)',
    '--spot-teal-glow: rgba(58,168,184,.38)',
    '--spot-plum-glow: rgba(123,53,120,.48)',
    # the shine and overlay peaks the model assumes
    '--glass-shine: rgba(255,255,255,.13)',
    '--glass-veil: rgba(255,255,255,.07)',
]


def check_pins(path):
    src = pathlib.Path(path).read_text()
    missing = [p for p in PINS if p not in src]
    if missing:
        print('MODEL DRIFT. These declarations are not in the stylesheet:')
        for m in missing:
            print('    ', m)
        print()
        return False
    print('Model pinned to %s: all %d declarations found.\n'
          % (pathlib.Path(path).name, len(PINS)))
    return True


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else (
        '/Users/grantgilman/Projects/nwsa-music-hub/.claude/worktrees/'
        'glass-redesign/docs/design/glass-sample.html')
    ok = check_pins(path)
    fails, worst = [], {}

    # The light field's safety argument: every orb must be at least as bright
    # as the base it sits on, so no orb can darken any pixel below the floor
    # the tables below measure.
    for pname, p in PRESETS.items():
        orbs = p.get('brighter_than')
        if not orbs:
            continue
        base_l = lum(p['page'])
        print('%s: orb luminance vs the base floor (%.4f)' % (pname, base_l))
        for o in orbs:
            d = lum(o)
            flag = 'ok  ' if d >= base_l else 'FAIL darkens the page'
            print('    rgb(%3d,%3d,%3d)  L=%.4f  %s' % (o + (d, flag)))
            if d < base_l:
                fails.append((pname, 'orb', 'rgb%s' % (o,), 'luminance', d))
        print()

    for pname, p in PRESETS.items():
        print('=' * 72)
        print(pname.upper())
        print('=' * 72)
        for lname, lobe in p['lobes'].items():
            print('  over the %s lobe (alpha %.3f, %d pass%s)'
                  % (lname, lobe[1], p['passes'], '' if p['passes'] == 1 else 'es'))
            for sname, (filt, ta, oa, sa) in p['tiers'].items():
                bg = surface(p['page'], lobe, p['passes'], filt, ta, oa, sa)
                line = '    %-16s rgb(%3.0f,%3.0f,%3.0f) ' % ((sname,) + bg)
                cells = []
                for cname, fg in p['text'].items():
                    r = ratio(fg, bg)
                    cells.append('%s %.2f%s' % (cname.split()[0], r,
                                                '' if r >= BAR else ' FAIL'))
                    if r < BAR:
                        fails.append((pname, lname, sname, cname, r))
                    k = (pname, cname)
                    if k not in worst or r < worst[k][0]:
                        worst[k] = (r, '%s / %s' % (lname, sname))
                print(line + '  ' + '   '.join(cells))
            print()

    print('=' * 72)
    print('WORST CASE PER TEXT COLOUR  (bar %.1f:1)' % BAR)
    print('=' * 72)
    for (pname, cname), (r, where) in sorted(worst.items(), key=lambda kv: kv[1][0]):
        print('  %-18s %-18s %6.2f:1   %s' % (pname, cname, r, where))

    print()
    if fails:
        print('%d FAILURE(S):' % len(fails))
        for f in fails:
            print('   %s | %s | %s | %s = %.2f:1' % f)
    else:
        print('PASS. Every text colour clears %.1f:1 on every surface, over every '
              'lobe, in every preset.' % BAR)
    return 0 if (ok and not fails) else 1


if __name__ == '__main__':
    sys.exit(main())
