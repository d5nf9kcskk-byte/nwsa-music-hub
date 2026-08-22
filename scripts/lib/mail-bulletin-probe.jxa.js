/**
 * JXA diagnostic run via:
 *   osascript -l JavaScript mail-bulletin-probe.jxa.js <sinceIso> <needle> [accountName]
 *
 * Answers "why did the bulletin fetch find nothing?" by looking EVERYWHERE in
 * the account — every mailbox, not just INBOX — and reporting what it sees
 * without saving anything:
 *
 *   [{ mailbox, subject, receivedDate, attachments: [{ name, downloaded }] }]
 *
 * The two failure modes this separates:
 *   • a Mail rule files the bulletin into a subfolder (INBOX-only fetch misses it)
 *   • the attachment exists but was never downloaded (saving it fails silently)
 */
function run(argv) {
  const since = new Date(argv[0]);
  const needle = String(argv[1] || 'bulletin').toLowerCase();
  const accountFilter = argv[2] || '';
  if (Number.isNaN(since.getTime())) {
    throw new Error('mail-bulletin-probe: bad since timestamp: ' + argv[0]);
  }

  const Mail = Application('Mail');
  Mail.includeStandardAdditions = true;

  /** Depth-limited walk; Mail nests folders arbitrarily and can cycle. */
  function walk(container, prefix, depth, out) {
    if (depth > 4) return;
    let boxes = [];
    try { boxes = container.mailboxes(); } catch (e) { return; }
    for (const b of boxes) {
      let name;
      try { name = String(b.name()); } catch (e) { continue; }
      const path = prefix ? prefix + '/' + name : name;
      out.push({ box: b, path: path });
      walk(b, path, depth + 1, out);
    }
  }

  const out = [];
  for (const acct of Mail.accounts()) {
    let acctName;
    try { acctName = String(acct.name()); } catch (e) { continue; }
    if (accountFilter && acctName !== accountFilter) continue;

    const boxes = [];
    walk(acct, '', 0, boxes);

    for (const entry of boxes) {
      let msgs = [];
      try {
        msgs = entry.box.messages.whose({ dateReceived: { '>': since } })();
      } catch (e) { continue; }

      for (const m of msgs) {
        let subject = '';
        try { subject = String(m.subject()); } catch (e) { /* */ }
        if (subject.toLowerCase().indexOf(needle) === -1) continue;

        let receivedDate = null;
        try { receivedDate = m.dateReceived().toISOString(); } catch (e) { /* */ }

        const attachments = [];
        let atts = [];
        try { atts = m.mailAttachments(); } catch (e) { atts = []; }
        for (let i = 0; i < atts.length; i++) {
          const a = { name: '', downloaded: null };
          try { a.name = String(atts[i].name()); } catch (e) { /* */ }
          try { a.downloaded = atts[i].downloaded(); } catch (e) { /* older Mail */ }
          attachments.push(a);
        }

        out.push({
          account: acctName,
          mailbox: entry.path,
          // Mirrors the fetchers' exclusion list, so the probe reports what
          // they will ACTUALLY read rather than everything that matched.
          skipped: /(^|\/)(sent|sent items|sent messages|drafts|junk|junk e-?mail|spam|trash|deleted items|deleted messages|outbox)$/i
            .test(entry.path),
          subject: subject,
          receivedDate: receivedDate,
          attachments: attachments,
        });
      }
    }
  }

  return JSON.stringify(out);
}
