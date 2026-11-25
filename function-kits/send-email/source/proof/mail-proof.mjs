// Emulator proof for the send-email kit (run: npm run proof, from source/).
// A local SMTP sink stands in for Brevo; mail docs are built by the app's own
// buildBroadcastMail, and memberMailStatus (functions/) does the writeback.
import assert from "node:assert/strict";
import { SMTPServer } from "smtp-server";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { buildBroadcastMail } from "../../../../functions/src/memberMail.ts";

const PASS = process.env.PROOF_SMTP_PASSWORD;
const got = [];
const sink = new SMTPServer({
  disabledCommands: ["STARTTLS"], allowInsecureAuth: true,
  onAuth(a, _s, cb) {
    a.username === "kituser" && a.password === PASS ? cb(null, { user: a.username }) : cb(new Error("535 bad credentials"));
  },
  onRcptTo(addr, _s, cb) {
    if (addr.address.startsWith("bounce@")) { const e = new Error("550 no such user"); e.responseCode = 550; return cb(e); }
    cb();
  },
  onData(stream, _s, cb) { let raw = ""; stream.on("data", d => (raw += d)); stream.on("end", () => { got.push(raw); cb(); }); },
});
await new Promise(r => sink.listen(2525, "127.0.0.1", r));

initializeApp({ projectId: "demo-mailkit" });
const db = getFirestore();
const until = async (what, fn, ms = 30000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise(r => setTimeout(r, 250))) {
    const v = await fn(); if (v) return v;
  }
  throw new Error(`timed out waiting for ${what}`);
};
const req = { subject: "Rehearsal moved, {name}", body: "Hi {name}, Saturday is at 2pm.", byEmail: "office@example.org" };

async function send(personnelId, to) {
  await db.doc(`memberMailQueue/q1/to/${personnelId}`).set({ name: "Ada Player", state: "queued", updatedAt: Date.now() });
  const mail = buildBroadcastMail({ req, queueId: "q1", personnelId, to, recipientName: "Ada",
    senderName: "AISO Office", orgName: "AISO", now: Date.now() });
  const ref = await db.collection("mail").add(mail);
  const doc = await until(`${to} final state`, async () => {
    const d = (await ref.get()).data(); return ["SUCCESS", "ERROR"].includes(d?.delivery?.state) && d;
  });
  const row = await until(`${personnelId} row writeback`, async () => {
    const r = (await db.doc(`memberMailQueue/q1/to/${personnelId}`).get()).data(); return r?.state !== "queued" && r;
  });
  return { ref, doc, row, mail };
}

// 1. A broadcast mail is sent, its status updates, and the player's row says sent.
const ok = await send("a1", "ada@example.org");
assert.equal(ok.doc.delivery.state, "SUCCESS");
assert.equal(ok.doc.delivery.attempts, 1);
assert.deepEqual(ok.doc.delivery.info.accepted, ["ada@example.org"]);
assert.equal(got.length, 1, "exactly one message reached SMTP");
const raw = got[0].replace(/\r\n[ \t]+/g, " "); // unfold headers
assert.match(raw, /^To: ada@example\.org/m);
assert.match(raw, /^Reply-To: office@example\.org/m);
assert.match(raw, /^Subject: Rehearsal moved, Ada/m);
assert.match(raw, /^From: Atlanta International Symphony Orchestra <info@aisymphonyorchestra\.org>/m);
assert.deepEqual(ok.doc.memberMail, { queueId: "q1", personnelId: "a1" }, "memberMail kept");
assert.equal(ok.doc.expireAt.toMillis(), ok.mail.expireAt.getTime(), "expireAt kept");
assert.equal(ok.doc.delivery.expireAt, undefined, "extension TTL stays off (never)");
assert.equal(ok.row.state, "sent");
console.log("PASS 1  sent: delivery SUCCESS, To/Reply-To/Subject/From right, memberMail + expireAt kept, row -> sent");

// 2. Another write to a finished doc does not send it again.
await ok.ref.update({ touched: true });
await new Promise(r => setTimeout(r, 3000));
assert.equal(got.length, 1, "no resend after SUCCESS");
console.log("PASS 2  a later write to a SUCCESS doc sends nothing");

// 3. An SMTP refusal ends in ERROR and the player's row says failed.
const bad = await send("a2", "bounce@example.org");
assert.equal(bad.doc.delivery.state, "ERROR");
assert.match(bad.doc.delivery.error, /550/);
assert.equal(bad.row.state, "failed");
assert.equal(got.length, 1);
console.log(`PASS 3  refused: delivery ERROR (${bad.doc.delivery.error}), row -> failed`);

sink.close();
console.log("mail-kit proof: all pass");
process.exit(0);
