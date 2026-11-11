# Starting the motion over: one liquid dissolve

Written 10 November 2026 for Dr. Gilman. This covers the new look only (the
glass look you switch on from your own phone). Nobody else sees any of it
until the look goes to everyone on Sunday 13 December.

## What was wrong

Tap a tab today and every card on the page flies to a new spot. Each card has
a different distance to cover but all are given the same 1.9 seconds, so a
card that barely moves crawls and a card that crosses the screen darts. That
is built into the method, so no amount of tuning could even it out. On top of
it, three other effects fire on the same tap, each on its own stopwatch: rows
rising in one after another, the page sliding sideways, and blocks fading in
as you scroll. Four stopwatches on one tap is what you have been calling
clunky. Five rounds adjusted the stopwatches. This plan removes them.

## What gets removed, and what stays

Everything that moves because you did something is removed. The three slow
background loops stay, because they are the glass itself and you asked for
the living logo by name. Say the word and they go too.

| What it is | When it happens | How long | Now |
|---|---|---|---|
| Page morph (cards fly to new places) | Every page change | 1.9 s, plus a 0.07 s delay per card | Removed |
| Old page fading under the morph | Every page change | 0.3 s | Removed |
| Rows and cards rising in, one after another | Any list appearing | 0.46 s each, 0.04 s apart, up to 11 steps | Removed |
| Page sliding in from the right | Opening a detail page | 0.24 s | Removed |
| Blocks fading in as you scroll | Scrolling a student page | Follows your finger | Removed |
| Selected chip or tab "pops" | Choosing something | 0.32 s | Removed |
| Button shrinks when pressed | Every press | 0.12 s | Removed |
| Ripple spreading from your finger | Every press | 0.56 s | Removed |
| Numbers rolling | Take Roll and Check-In counts | 0.42 s | Removed |
| Check marks drawing themselves | Any check mark appearing | 0.56 s | Removed |
| Burst of music notes | After checking in or sending a form | 1.3 s | Removed |
| The look's own menu opening | Opening the menu | 0.22 s shade, 0.38 s panel | Removed |
| The look's own drawer opening (staff) | Opening a drawer or sheet | 0.22 s shade, 0.38 s sheet | Removed |
| Soft glow easing onto a text box (staff) | Tapping into a field | 0.2 s | Removed |
| Colour drifting behind the glass | Always | 40 s and 56 s loops | Kept |
| The living logo (shine and slow breath) | Always | 10 s and 16 s loops | Kept |
| Light passing across the big glass panes | Always | 10 s loop | Kept |

After the removal, menus and drawers open with the short slide the Hub has
always had with the look off, about a fifth of a second. Nothing else moves.

## What gets built

One effect, used for every page change on both the student side and the staff
side: the page you are leaving goes out of focus until it is only soft
colour, the colour of the next page flows in underneath, and the next page
comes into focus. Nothing on the page travels. It is done with a single
sheet of "frosted glass" laid over the page that fogs up and clears, so
every part of the screen changes at exactly the same rate on one stopwatch.
That is the direct fix for "they don't move at the same rate".

It also reaches places the old morph never did. The old one never ran on
three of the four staff panels (Applied Teacher, Classroom Teacher and
Student Assistant), because those switch screens in a way it could not see.

## The order

1. **Strip.** One change that takes all the motion in the table out. Your
   phone then shows the glass standing still, which is the clean start you
   asked for. It goes live as soon as its checks pass, except on a concert
   day. It was built on top of another finished change ("One look, both
   sides", number 234), which went live on 10 November, so nothing is in its
   way now.
2. **Sample.** A page you open on your iPhone with a working phone screen
   inside it and two switches, Transition and Pace. It includes "None" (the
   stripped state), "Today" (what you have now, to compare against) and the
   new candidates. It also carries a lighter version of each, in case the
   smooth one stutters on your phone.
3. **Build what you picked**, into the real Hub, on every student page and
   all four staff panels, on one stopwatch.
4. **You check it on your phone.** The look still goes to everyone on
   13 December as planned.

## What you will be asked

One question, after you have tried the sample on your iPhone:

- Which **Transition**?
- Which **Pace**?
- Was it **smooth** on your phone?

Nothing is built into the Hub until you answer. Your earlier choice of the
slowest pace was for cards travelling. A page that is out of focus for nearly
two seconds is a different thing, so the sample asks again.

## What has not been tested

Everything so far has been measured on a desktop copy of Chrome. None of it
has been run in Safari or on a real iPhone. That is the reason the sample
goes to your phone before anything goes into the Hub.
