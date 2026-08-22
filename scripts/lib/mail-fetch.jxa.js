/**
 * JXA (JavaScript for Automation) helper run via:
 *   osascript -l JavaScript mail-fetch.jxa.js <sinceIsoTimestamp> [accountName]
 *
 * Asks Apple Mail for every Inbox message received after `since`, across all
 * accounts (or just `accountName` when given), and prints them as a JSON
 * array on stdout: [{ messageId, subject, from, receivedDate, body }, ...].
 *
 * `.whose(...)` pushes the date filter into Mail itself instead of walking
 * every message over the Apple Events bridge one at a time, which is the
 * difference between this finishing in a second and taking minutes on a
 * large mailbox.
 */
function run(argv) {
  const since = new Date(argv[0]);
  const accountFilter = argv[1] || '';
  if (Number.isNaN(since.getTime())) {
    throw new Error('mail-fetch: bad since timestamp: ' + argv[0]);
  }

  const Mail = Application('Mail');
  Mail.includeStandardAdditions = true;

  /**
   * Mailboxes holding mail that was never RECEIVED here. Sent Items is the
   * one that matters: without this, a director's own outgoing mail gets
   * parsed for student absences. Archive is deliberately searched — a triage
   * rule can file a parent's email there before the next run.
   */
  const SKIP = /^(sent|sent items|sent messages|drafts|junk|junk e-?mail|spam|trash|deleted items|deleted messages|outbox)$/i;

  /** Depth-limited walk; Mail nests folders arbitrarily and can cycle. */
  function walk(container, depth, out) {
    if (depth > 4) return;
    let boxes = [];
    try { boxes = container.mailboxes(); } catch (e) { return; }
    for (const b of boxes) {
      let name;
      try { name = String(b.name()); } catch (e) { continue; }
      if (SKIP.test(name)) continue;
      out.push(b);
      walk(b, depth + 1, out);
    }
  }

  const out = [];
  const seen = {};
  const accounts = Mail.accounts();
  for (const acct of accounts) {
    let acctName;
    try { acctName = acct.name(); } catch (e) { continue; }
    if (accountFilter && acctName !== accountFilter) continue;

    const boxes = [];
    walk(acct, 0, boxes);

    let msgs = [];
    for (const b of boxes) {
      try {
        msgs = msgs.concat(b.messages.whose({ dateReceived: { '>': since } })());
      } catch (e) { /* mailbox not searchable */ }
    }

    for (const m of msgs) {
      let receivedDate;
      try { receivedDate = m.dateReceived(); } catch (e) { continue; }
      let messageId = '';
      try { messageId = m.messageId(); } catch (e) { /* some drafts/local msgs lack one */ }
      let subject = '';
      try { subject = m.subject(); } catch (e) { /* */ }
      let from = '';
      try { from = m.sender(); } catch (e) { /* */ }
      let body = '';
      try { body = String(m.content()).slice(0, 4000); } catch (e) { /* */ }

      // One message surfaces from several mailboxes (a folder plus an
      // "All Mail"-style container), so a duplicate here is the normal case.
      const key = messageId || `${acctName}:${receivedDate.getTime()}:${subject}`;
      if (seen[key]) continue;
      seen[key] = true;

      out.push({
        messageId: messageId || `${acctName}:${receivedDate.toISOString()}:${subject}`,
        subject,
        from,
        receivedDate: receivedDate.toISOString(),
        body,
      });
    }
  }

  return JSON.stringify(out);
}
