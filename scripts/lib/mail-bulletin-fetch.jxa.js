/**
 * JXA helper run via:
 *   osascript -l JavaScript mail-bulletin-fetch.jxa.js <sinceIso> <outDir> <subjectNeedle> [accountName]
 *
 * Finds recent Attendance Bulletin messages in Apple Mail and saves their PDF
 * attachments into <outDir>, printing a JSON array:
 *   [{ messageId, subject, receivedDate, files: [savedPath, ...] }, ...]
 *
 * This replaces the OneDrive drop the pipeline used to read. Bulletins land in
 * Mail as attachments anyway, and ~/Library/CloudStorage is TCC-protected in a
 * way that denied the scheduled job the file itself — surfacing as the
 * misleading "Need pdftotext (poppler) or pymupdf to read PDF". Saving the
 * attachment to an ordinary temp directory sidesteps that entirely.
 */
function run(argv) {
  const since = new Date(argv[0]);
  const outDir = argv[1];
  const needle = String(argv[2] || 'attendance bulletin').toLowerCase();
  const accountFilter = argv[3] || '';
  if (Number.isNaN(since.getTime())) {
    throw new Error('mail-bulletin-fetch: bad since timestamp: ' + argv[0]);
  }
  if (!outDir) throw new Error('mail-bulletin-fetch: outDir is required');

  const Mail = Application('Mail');
  Mail.includeStandardAdditions = true;
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;

  /**
   * Mailboxes that hold mail the pipeline must never treat as RECEIVED.
   * Sent Items especially: forwarding a bulletin to yourself leaves a copy
   * there, and reading it back is reading your own outgoing mail. Archive is
   * deliberately NOT excluded — a triage rule files the real bulletin there
   * within the hour, which is why an INBOX-only search found nothing.
   */
  const SKIP = /^(sent|sent items|sent messages|drafts|junk|junk e-?mail|spam|trash|deleted items|deleted messages|outbox)$/i;

  /** Depth-limited walk; Mail nests folders arbitrarily and can cycle. */
  function walk(container, prefix, depth, out) {
    if (depth > 4) return;
    let boxes = [];
    try { boxes = container.mailboxes(); } catch (e) { return; }
    for (const b of boxes) {
      let name;
      try { name = String(b.name()); } catch (e) { continue; }
      if (SKIP.test(name)) continue;
      const path = prefix ? prefix + '/' + name : name;
      out.push(b);
      walk(b, path, depth + 1, out);
    }
  }

  const out = [];
  const seen = {};
  for (const acct of Mail.accounts()) {
    let acctName;
    try { acctName = acct.name(); } catch (e) { continue; }
    if (accountFilter && acctName !== accountFilter) continue;

    // Every mailbox, not just INBOX: a Mail rule filing the bulletin into a
    // folder is the ordinary case, and an INBOX-only search misses it while
    // reporting a clean "no bulletin found".
    const boxes = [];
    walk(acct, '', 0, boxes);

    let msgs = [];
    for (const b of boxes) {
      try {
        msgs = msgs.concat(b.messages.whose({ dateReceived: { '>': since } })());
      } catch (e) { /* mailbox not searchable */ }
    }

    for (const m of msgs) {
      let subject = '';
      try { subject = String(m.subject()); } catch (e) { /* */ }
      if (subject.toLowerCase().indexOf(needle) === -1) continue;

      let receivedDate;
      try { receivedDate = m.dateReceived(); } catch (e) { continue; }
      let messageId = '';
      try { messageId = String(m.messageId()); } catch (e) { /* */ }

      // One message can surface from several mailboxes (a folder plus an
      // "All Mail"-style container), so saving twice is the normal case.
      const key = messageId || subject + '@' + receivedDate.getTime();
      if (seen[key]) continue;
      seen[key] = true;

      const files = [];
      let atts = [];
      try { atts = m.mailAttachments(); } catch (e) { atts = []; }
      for (let i = 0; i < atts.length; i++) {
        let name = '';
        try { name = String(atts[i].name()); } catch (e) { continue; }
        if (!/\.pdf$/i.test(name)) continue;
        // Stamp the path so two bulletins in the window can't collide, and so
        // the runner can pick the newest by name alone.
        const safe = name.replace(/[^A-Za-z0-9._-]/g, '_');
        const dest = outDir + '/' + receivedDate.getTime() + '-' + safe;
        try {
          Mail.save(atts[i], { in: Path(dest) });
          files.push(dest);
        } catch (e) { /* not downloaded yet, or unreadable — skip it */ }
      }

      if (files.length > 0) {
        out.push({
          messageId: messageId || acctName + ':' + receivedDate.toISOString(),
          subject: subject,
          receivedDate: receivedDate.toISOString(),
          files: files,
        });
      }
    }
  }

  return JSON.stringify(out);
}
