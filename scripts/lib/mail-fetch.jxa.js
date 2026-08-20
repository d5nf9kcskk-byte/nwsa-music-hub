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

  const out = [];
  const accounts = Mail.accounts();
  for (const acct of accounts) {
    let acctName;
    try { acctName = acct.name(); } catch (e) { continue; }
    if (accountFilter && acctName !== accountFilter) continue;

    let inbox;
    try {
      inbox = acct.mailboxes.byName('INBOX');
      inbox.name();
    } catch (e) { continue; }

    let msgs;
    try {
      msgs = inbox.messages.whose({ dateReceived: { '>': since } })();
    } catch (e) { continue; }

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
