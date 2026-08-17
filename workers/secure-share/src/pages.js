/**
 * HTML pages + browser JS for Forge RPA Secure Share.
 *
 * Everything here is served inline by the Worker (src/index.js). There is no
 * build step and no external request: fonts fall back to the system stack, the
 * anvil mark is inline SVG, and the client scripts are same-origin. That keeps
 * the whole tool under a strict `default-src 'none'` Content Security Policy.
 *
 * All secret encryption/decryption happens in the browser scripts below
 * (CREATE_JS, REVEAL_JS). The server never sees plaintext, the key, or the
 * optional passphrase.
 *
 * Fragment formats (everything after '#', never sent to the server):
 *   no passphrase:  <id>.<rawKeyB64url>
 *   passphrase:     <id>.P.<saltB64url>.<wrapIvB64url>.<wrappedKeyB64url>
 * With a passphrase the 256-bit content key is wrapped (AES-GCM) by a key
 * derived from the passphrase (PBKDF2). The recipient must supply the passphrase
 * to unwrap it, and that unwrap happens BEFORE any server fetch, so a wrong
 * passphrase (or an auto-clicking email scanner with no passphrase) never burns
 * the secret.
 */

// The anvil brand mark, in amber. Matches public/favicon.svg on forgerpa.com.
export const FAVICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Forge RPA">' +
  '<polygon points="0,147.1 149.2,90.7 512,90.7 512,175.4 387,175.4 366.9,203.6 366.9,292.3 459.6,368.9 459.6,421.3 96.8,421.3 96.8,368.9 189.5,292.3 189.5,203.6 173.4,175.4 0,147.1" fill="#f59e0b"/>' +
  "</svg>";

const CURRENT_YEAR = 2026;

const STYLES = `
:root{
  --charcoal:#1a1a2e; --charcoal-light:#2d2d44;
  --amber:#f59e0b; --amber-dark:#d97706; --amber-light:#fbbf24;
  --slate:#f8fafc; --line:#e5e7eb;
  --gray-300:#d1d5db; --gray-400:#9ca3af; --gray-500:#6b7280;
  --gray-700:#374151; --gray-800:#1f2937; --gray-900:#111827;
  --font-sans:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  --font-mono:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  font-family:var(--font-sans); color:var(--gray-900); background:var(--slate);
  min-height:100vh; display:flex; flex-direction:column; line-height:1.55;
  -webkit-font-smoothing:antialiased;
}
a{color:var(--amber-dark)}
header.site{
  background:var(--charcoal); position:sticky; top:0; z-index:50;
  box-shadow:0 4px 12px rgba(0,0,0,.15);
}
header.site .bar{
  max-width:720px; margin:0 auto; padding:0 1.25rem; height:4rem;
  display:flex; align-items:center; justify-content:space-between;
}
.brand{display:flex; align-items:center; gap:.6rem; text-decoration:none}
.brand .anvil{height:34px; width:auto; display:block}
.brand .name{color:var(--amber); font-weight:800; font-size:1.5rem; letter-spacing:-.01em}
.brand .divider{width:1px; height:22px; background:var(--gray-700)}
.brand .sub{color:var(--gray-300); font-weight:500; font-size:.95rem}
.homelink{color:var(--gray-400); text-decoration:none; font-size:.85rem; font-weight:500}
.homelink:hover{color:#fff}
main{flex:1; width:100%; max-width:640px; margin:0 auto; padding:2.5rem 1.25rem 3rem}
.card{
  background:#fff; border:1px solid var(--line); border-top:3px solid var(--amber);
  border-radius:16px; padding:2rem 2rem 2rem; box-shadow:0 10px 25px -12px rgba(26,26,46,.18);
}
h1{font-size:1.6rem; font-weight:800; letter-spacing:-.02em; margin:0 0 .5rem; color:var(--charcoal)}
.lede{color:var(--gray-500); margin:0 0 1.5rem; font-size:1rem}
label{display:block; font-weight:600; font-size:.9rem; margin:0 0 .4rem; color:var(--gray-800)}
textarea,input,select{
  width:100%; font-family:var(--font-mono); font-size:.95rem; color:var(--gray-900);
  background:#fff; border:1px solid var(--gray-300); border-radius:8px; padding:.75rem .85rem;
}
textarea{min-height:130px; resize:vertical; line-height:1.5}
textarea:focus,input:focus,select:focus{
  outline:none; border-color:var(--amber); box-shadow:0 0 0 3px rgba(245,158,11,.18);
}
select{font-family:var(--font-sans); cursor:pointer}
.field{margin-bottom:1.25rem}
.hint{color:var(--gray-500); font-size:.8rem; margin:.4rem 0 0; font-family:var(--font-sans); line-height:1.45}
.seg{display:inline-flex; background:var(--slate); border:1px solid var(--gray-300); border-radius:8px; padding:3px; margin-bottom:.7rem; gap:3px}
.seg-btn{appearance:none; border:none; background:transparent; cursor:pointer; font-family:var(--font-sans); font-weight:600; font-size:.85rem; color:var(--gray-500); padding:.4rem 1rem; border-radius:6px; transition:background-color .12s,color .12s}
.seg-btn:hover{color:var(--charcoal)}
.seg-btn.active{background:var(--amber); color:var(--charcoal); box-shadow:0 2px 5px -1px rgba(245,158,11,.5)}
.seg-btn.active:hover{background:var(--amber-dark); color:var(--charcoal)}
input[type=file]{font-family:var(--font-sans); font-size:.9rem; padding:.6rem .7rem; cursor:pointer}
.filecard{display:flex; align-items:center; gap:.85rem; background:var(--slate); border:1px solid var(--line); border-radius:10px; padding:.9rem 1rem; margin-bottom:1rem}
.filecard svg{flex:none; width:30px; height:30px; color:var(--amber-dark)}
.filecard .fname{font-weight:600; color:var(--gray-900); word-break:break-all; font-family:var(--font-mono); font-size:.9rem}
.filecard .fsize{color:var(--gray-500); font-size:.8rem; margin-top:.15rem; font-family:var(--font-sans)}
.btn{
  display:inline-flex; align-items:center; justify-content:center; gap:.5rem;
  width:100%; padding:.85rem 1.5rem; border:none; border-radius:8px; cursor:pointer;
  background:var(--amber); color:var(--charcoal); font-weight:700; font-size:1rem;
  font-family:var(--font-sans); transition:background-color .15s;
  box-shadow:0 8px 16px -8px rgba(245,158,11,.5);
}
.btn:hover{background:var(--amber-dark)}
.btn:disabled{opacity:.6; cursor:default; box-shadow:none}
.btn.secondary{
  background:transparent; color:var(--charcoal); border:1.5px solid var(--gray-300);
  box-shadow:none; font-weight:600;
}
.btn.secondary:hover{background:var(--slate); border-color:var(--gray-400)}
.btn-row{display:flex; gap:.6rem; margin-top:1rem}
.assure{
  display:flex; gap:.6rem; align-items:flex-start; margin-top:1.5rem; padding-top:1.25rem;
  border-top:1px solid var(--line); color:var(--gray-500); font-size:.83rem;
}
.assure svg{flex:none; width:18px; height:18px; margin-top:1px; color:var(--amber-dark)}
.msg{display:none; margin-top:1rem; padding:.8rem .9rem; border-radius:8px; font-size:.9rem; font-weight:500}
.msg.err{background:#fef2f2; color:#991b1b; border:1px solid #fecaca}
.msg.ok{background:#f0fdf4; color:#166534; border:1px solid #bbf7d0}
.msg.warn{background:#fffbeb; color:#92400e; border:1px solid #fde68a}
.outbox{margin-top:.5rem}
.outbox .row{display:flex; gap:.6rem; align-items:stretch}
.outbox input,.outbox textarea{background:var(--slate)}
.outbox .row .btn,.pass-reminder .row .btn{width:auto; padding:.75rem 1.1rem; white-space:nowrap}
.note{color:var(--gray-500); font-size:.85rem; margin:.75rem 0 0}
.mrow{display:flex; align-items:center; gap:.6rem; padding:.55rem .7rem; border:1px solid var(--line); border-radius:8px; margin-bottom:.5rem}
.mrow .who{flex:1; font-family:var(--font-mono); font-size:.85rem; color:var(--gray-900); word-break:break-all}
.mrow .st{font-weight:700; font-size:.78rem; white-space:nowrap}
.mrow .st.ok{color:#166534}
.mrow .st.err{color:#991b1b}
.mrow .mcopy{width:auto; padding:.35rem .7rem; font-size:.78rem; box-shadow:none}
.pass-reminder{
  display:none; margin-top:1.25rem; padding:.85rem .95rem; border-radius:10px;
  background:#fffbeb; border:1px solid #fde68a; color:#92400e; font-size:.88rem;
}
.pass-reminder .row{display:flex; gap:.6rem; align-items:stretch; margin-top:.5rem}
.pass-reminder code{
  font-family:var(--font-mono); background:#fff; border:1px solid #fde68a;
  border-radius:6px; padding:.5rem .6rem; flex:1; color:#78350f; word-break:break-all;
}
.reveal-warn{
  background:#fffbeb; border:1px solid #fde68a; border-radius:10px;
  padding:1rem 1.1rem; margin:0 0 1.5rem; color:#92400e; font-size:.92rem;
}
.reveal-warn strong{color:#78350f}
footer.site{background:var(--charcoal); color:var(--gray-400); font-size:.82rem}
footer.site .inner{max-width:720px; margin:0 auto; padding:1.5rem 1.25rem; text-align:center}
footer.site a{color:var(--gray-300); text-decoration:none}
footer.site a:hover{color:var(--amber-light)}
footer.site .copy{color:var(--gray-500); margin-top:.35rem}
.hist-head{display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:.25rem}
.hist-head h1{margin:0}
.hist-head .btn{width:auto; padding:.55rem 1rem; font-size:.85rem}
.tablewrap{overflow-x:auto; margin-top:1rem}
table.hist{width:100%; border-collapse:collapse; font-size:.88rem}
table.hist th{text-align:left; font-size:.72rem; text-transform:uppercase; letter-spacing:.04em; color:var(--gray-500); font-weight:700; padding:.5rem .6rem; border-bottom:2px solid var(--line)}
table.hist td{padding:.65rem .6rem; border-bottom:1px solid var(--line); vertical-align:top; word-break:break-word}
.muted{color:var(--gray-400)}
.pill{display:inline-block; font-size:.75rem; font-weight:700; padding:.2rem .55rem; border-radius:999px; white-space:nowrap}
.pill.st-active{background:#eff6ff; color:#1e40af}
.pill.st-opened{background:#f0fdf4; color:#166534}
.pill.st-expired{background:#f3f4f6; color:#6b7280}
.tag{display:inline-block; font-size:.68rem; font-weight:600; color:var(--amber-dark); background:#fffbeb; border:1px solid #fde68a; border-radius:5px; padding:.05rem .35rem; margin-left:.25rem}
.pill.st-pending{background:#eff6ff; color:#1e40af}
.pill.st-submitted{background:#fefce8; color:#854d0e}
.pill.st-claimed{background:#f0fdf4; color:#166534}
/* Inbound Secure Requests: mint field editor */
.fieldlist{margin:.25rem 0 .6rem}
.fieldrow{display:flex; align-items:center; gap:.5rem; margin-bottom:.5rem}
.fieldrow input[type=text]{flex:1; font-family:var(--font-sans); font-size:.9rem}
.fieldrow .secretbox{display:inline-flex; align-items:center; gap:.3rem; font-family:var(--font-sans); font-size:.78rem; color:var(--gray-700); font-weight:600; white-space:nowrap}
.fieldrow .secretbox input{width:auto; margin:0}
.fieldrow .rm{flex:none; width:auto; padding:.4rem .6rem; font-size:.78rem; background:transparent; color:var(--gray-500); border:1.5px solid var(--gray-300); box-shadow:none; font-weight:700}
.fieldrow .rm:hover{background:var(--slate); color:#991b1b; border-color:var(--gray-400)}
.addfield{width:auto; padding:.5rem .9rem; font-size:.85rem; background:transparent; color:var(--charcoal); border:1.5px dashed var(--gray-300); box-shadow:none; font-weight:600}
.addfield:hover{background:var(--slate); border-color:var(--amber)}
/* Mint result: the two links */
.reqlink{margin-top:1.25rem}
.reqlink.first{margin-top:0}
.reqlink .cap{font-family:var(--font-sans); font-size:.82rem; color:var(--gray-500); margin:.4rem 0 0; line-height:1.45}
.reqlink .cap strong{color:var(--gray-800)}
/* Submit page: one requested field */
.reqfield{margin-bottom:1rem}
.reqfield>label{display:flex; align-items:center; gap:.35rem}
.reqfield .lock{width:13px; height:13px; color:var(--amber-dark); flex:none}
.pwrap{display:flex; gap:.5rem; align-items:stretch}
.pwrap input{flex:1; min-width:0}
.pwrap .toggle,.vbtns .toggle{flex:none; width:auto; padding:.5rem .75rem; font-size:.78rem; background:transparent; color:var(--charcoal); border:1.5px solid var(--gray-300); box-shadow:none; font-weight:600}
.pwrap .toggle:hover,.minibtn.secondary:hover{background:var(--slate); border-color:var(--gray-400)}
/* Claim reveal: the fields table */
.kvtable{width:100%; border-collapse:collapse; margin-top:.5rem}
.kvtable td{padding:.65rem .5rem; border-bottom:1px solid var(--line); vertical-align:top}
.kvtable td.k{font-weight:700; color:var(--gray-800); font-family:var(--font-sans); font-size:.85rem; word-break:break-word; width:30%; padding-right:1rem}
.kvtable td.v{font-family:var(--font-mono); font-size:.9rem; color:var(--gray-900)}
.kvtable .vwrap{display:flex; align-items:center; gap:.5rem}
.kvtable .vval{flex:1; word-break:break-all}
.kvtable .vbtns{display:flex; gap:.35rem; flex:none}
.minibtn{width:auto; padding:.35rem .65rem; font-size:.75rem; box-shadow:none; font-weight:700}
.minibtn.secondary{background:transparent; color:var(--charcoal); border:1.5px solid var(--gray-300)}
.substatus{font-size:.72rem; margin-top:.25rem}
table.hist tr.stale td{background:#fffbeb}
.actioncell{white-space:nowrap}
.qrwrap{margin-top:1rem; text-align:center}
.qrwrap svg{width:160px; height:160px; border:1px solid var(--line); border-radius:8px; background:#fff}
.qrwrap .cap{text-align:center}
@media (max-width:480px){
  main{padding:1.5rem 1rem 2.5rem}
  .card{padding:1.5rem}
  .brand .sub{display:none}
  .outbox .row,.pass-reminder .row{flex-direction:column}
  .outbox .row .btn,.pass-reminder .row .btn{width:100%}
  .fieldrow{flex-wrap:wrap}
  .fieldrow input[type=text]{flex:1 1 100%}
  .kvtable td.k{width:auto; display:block; border:none; padding-bottom:.15rem}
  .kvtable td.v{display:block; padding-top:0}
  .kvtable tr{display:block; padding:.35rem 0}
}
`;

const LOCK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

const FILE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
  '<polyline points="14 2 14 8 20 8"/></svg>';

function shell(title, bodyHtml, scriptSrc) {
  return (
    "<!DOCTYPE html>" +
    '<html lang="en"><head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    "<title>" +
    title +
    "</title>" +
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg">' +
    "<style>" +
    STYLES +
    "</style>" +
    "</head><body>" +
    '<header class="site"><div class="bar">' +
    '<a class="brand" href="https://forgerpa.com">' +
    '<img class="anvil" src="/anvil-mark.png" alt="Forge RPA" width="52" height="34">' +
    '<span class="name">Forge RPA</span>' +
    '<span class="divider"></span>' +
    '<span class="sub">Secure Share</span>' +
    "</a>" +
    '<a class="homelink" href="https://forgerpa.com">forgerpa.com</a>' +
    "</div></header>" +
    "<main>" +
    bodyHtml +
    "</main>" +
    '<footer class="site"><div class="inner">' +
    "<div>Encrypted in your browser. " +
    '<a href="https://forgerpa.com">Forge RPA</a> never sees the secret.</div>' +
    '<div class="copy">&copy; ' +
    CURRENT_YEAR +
    " Forge RPA. All rights reserved.</div>" +
    "</div></footer>" +
    (scriptSrc ? '<script src="' + scriptSrc + '"></script>' : "") +
    "</body></html>"
  );
}

export function renderCreatePage() {
  const body =
    '<div class="card">' +
    '<div id="form-panel">' +
    "<h1>Create a Secure Link</h1>" +
    '<p class="lede">Paste a password, key, or connection string. It is encrypted in your ' +
    "browser before it ever leaves this page. The link can be opened once, then it is gone.</p>" +
    '<div class="field">' +
    "<label>Secret</label>" +
    '<div class="seg" id="mode-seg">' +
    '<button type="button" class="seg-btn active" data-mode="text">Text</button>' +
    '<button type="button" class="seg-btn" data-mode="file">File</button>' +
    "</div>" +
    '<div id="text-field">' +
    '<textarea id="secret" autocomplete="off" autocorrect="off" autocapitalize="off" ' +
    'spellcheck="false" placeholder="Paste the password, key, or connection string to share"></textarea>' +
    "</div>" +
    '<div id="file-field" style="display:none">' +
    '<input id="file-input" type="file">' +
    '<p class="hint">For keys, certificates, and small config files (under 50 KB). ' +
    "Encrypted in your browser exactly like text.</p>" +
    "</div>" +
    "</div>" +
    '<div class="field">' +
    '<label for="ttl">Expires After</label>' +
    '<select id="ttl">' +
    '<option value="3600">1 Hour</option>' +
    '<option value="86400">24 Hours</option>' +
    '<option value="259200" selected>72 Hours</option>' +
    '<option value="604800">7 Days</option>' +
    "</select>" +
    "</div>" +
    '<div class="field">' +
    '<label for="passphrase">Passphrase (Optional)</label>' +
    '<input id="passphrase" type="text" autocomplete="off" autocorrect="off" ' +
    'autocapitalize="off" spellcheck="false" placeholder="Add a passphrase the recipient must enter">' +
    '<p class="hint">Recommended for high-value secrets. Send it to the recipient separately ' +
    "(text or a call), never with the link. It also stops email scanners from opening the link.</p>" +
    "</div>" +
    '<div class="field">' +
    '<label for="label">Label (Optional)</label>' +
    '<input id="label" type="text" autocomplete="off" maxlength="120" ' +
    'placeholder="A name for your history, e.g. MRCO OneDataSource SFTP">' +
    '<p class="hint">Shown in your Send History and in the email sent to recipients. Never part of the encrypted secret.</p>' +
    "</div>" +
    '<div class="field">' +
    '<label for="recipient">Email To (Optional)</label>' +
    '<input id="recipient" type="text" autocomplete="off" placeholder="vendor@example.com, backup@example.com">' +
    '<p class="hint">If set, Forge RPA emails them the link. Separate multiple addresses with commas. ' +
    "Leave blank to copy and send it yourself.</p>" +
    '<div id="delivery-wrap" style="display:none;margin-top:.7rem">' +
    '<div class="seg" id="delivery-seg">' +
    '<button type="button" class="seg-btn active" data-dmode="separate">Separate Link Each</button>' +
    '<button type="button" class="seg-btn" data-dmode="shared">One Shared Link</button>' +
    "</div>" +
    '<p class="hint" id="delivery-hint">Each recipient gets their own one-time link. Everyone can retrieve it once, ' +
    "and Send History shows who opened which.</p>" +
    "</div>" +
    '<label id="alsopass-wrap" style="display:none;margin-top:.6rem;font-weight:500;font-size:.85rem;color:var(--gray-700)">' +
    '<input id="alsopass" type="checkbox" style="width:auto;margin-right:.45rem;vertical-align:middle">' +
    "Also email the passphrase in a separate message" +
    "</label>" +
    "</div>" +
    '<button id="create-btn" class="btn">Create Secure Link</button>' +
    '<div id="error" class="msg err"></div>' +
    '<div class="assure">' +
    LOCK_ICON +
    "<span>Zero knowledge. A random AES-256 key is generated in your browser and placed " +
    "only in the link fragment after the # sign, which browsers never send to a server. " +
    "We store encrypted text and nothing else.</span>" +
    "</div>" +
    '<p class="note" style="margin-top:1.25rem"><a href="/admin/history">View Send History</a></p>' +
    "</div>" +
    '<div id="result-panel" style="display:none">' +
    '<h1 id="result-title">Your Secure Link Is Ready</h1>' +
    '<p class="lede" id="result-lede">Share this link with the recipient over your normal channel. ' +
    "It can be opened one time.</p>" +
    '<div id="single-out" class="outbox">' +
    '<label for="link-out">One-Time Link</label>' +
    '<div class="row">' +
    '<input id="link-out" type="text" readonly>' +
    '<button id="copy-btn" class="btn">Copy Link</button>' +
    "</div>" +
    '<p id="ttl-note" class="note"></p>' +
    "</div>" +
    '<div id="multi-list" style="display:none"></div>' +
    '<div id="email-note" class="msg"></div>' +
    '<div id="pass-reminder" class="pass-reminder">' +
    "<strong>Send this passphrase separately.</strong> The recipient needs it to open the " +
    "link. Do not send it in the same message as the link." +
    '<div class="row">' +
    '<code id="pass-value"></code>' +
    '<button id="copy-pass-btn" class="btn">Copy</button>' +
    "</div>" +
    "</div>" +
    '<div class="btn-row">' +
    '<button id="another-btn" class="btn secondary">Create Another</button>' +
    "</div>" +
    "</div>" +
    "</div>";
  return shell("Forge RPA Secure Share", body, "/admin/create.js");
}

export function renderViewPage(env, mode) {
  if (mode === "notfound") {
    const nf =
      '<div class="card">' +
      "<h1>This Link Is Not Valid</h1>" +
      '<p class="lede">This page could not be found. A secure link looks like ' +
      "<code>/s#...</code> and includes the decryption key after the # sign. Ask the sender " +
      "to resend the full link.</p>" +
      "</div>";
    return shell("Not Found | Forge RPA Secure Share", nf, null);
  }
  const body =
    '<div class="card">' +
    '<div id="reveal-panel">' +
    "<h1>You Have a One-Time Secret</h1>" +
    '<p class="lede">Someone shared an encrypted secret with you through Forge RPA Secure Share.</p>' +
    '<div class="reveal-warn"><strong>Read this first.</strong> This secret can be viewed only ' +
    "once. The moment it is revealed, it is permanently destroyed on the server. Have somewhere " +
    "ready to paste it before you continue.</div>" +
    '<div id="pass-field" class="field" style="display:none">' +
    '<label for="passphrase-in">Passphrase</label>' +
    '<input id="passphrase-in" type="text" autocomplete="off" autocorrect="off" ' +
    'autocapitalize="off" spellcheck="false" placeholder="Enter the passphrase the sender gave you">' +
    '<p class="hint">The sender shared this with you separately, not inside the link. The secret ' +
    "is only retrieved once the passphrase is correct, so a wrong try does not destroy it.</p>" +
    "</div>" +
    '<button id="reveal-btn" class="btn">Reveal Secret</button>' +
    '<div class="assure">' +
    LOCK_ICON +
    "<span>The secret is decrypted here in your browser using the key from the link fragment. " +
    "Forge RPA only ever stored encrypted text.</span>" +
    "</div>" +
    "</div>" +
    '<div id="secret-panel" style="display:none">' +
    "<h1>Here Is Your Secret</h1>" +
    '<div id="text-out-wrap" class="outbox" style="display:none">' +
    '<label for="secret-out">Secret</label>' +
    '<textarea id="secret-out" readonly spellcheck="false"></textarea>' +
    '<div class="btn-row">' +
    '<button id="copy-secret-btn" class="btn">Copy Secret</button>' +
    "</div>" +
    "</div>" +
    '<div id="file-out-wrap" style="display:none">' +
    '<div class="filecard">' +
    FILE_ICON +
    '<div><div class="fname" id="file-name"></div><div class="fsize" id="file-size"></div></div>' +
    "</div>" +
    '<button id="download-btn" class="btn">Download File</button>' +
    "</div>" +
    "</div>" +
    '<div id="status" class="msg"></div>' +
    "</div>";
  return shell("You Have a Secret | Forge RPA Secure Share", body, "/reveal.js");
}

// Server-rendered history of created secrets (metadata only). Access-gated at
// the edge because it lives under /admin. rows come from index.js listMeta().
export function renderHistoryPage(env, rows) {
  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const fmt = (sec) => {
    if (!sec) return "";
    try {
      return (
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Chicago",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(sec * 1000)) + " CT"
      );
    } catch (e) {
      return new Date(sec * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
    }
  };
  const nowSec = Math.floor(Date.now() / 1000);
  let trs = "";
  for (const m of rows) {
    let status, cls;
    if (m.s === "opened") {
      status = "Opened " + fmt(m.o);
      cls = "st-opened";
    } else if (m.e && m.e < nowSec) {
      status = "Expired";
      cls = "st-expired";
    } else {
      status = "Active";
      cls = "st-active";
    }
    const tags =
      (m.f ? '<span class="tag">File</span>' : "") +
      (m.p ? '<span class="tag">Passphrase</span>' : "");
    trs +=
      "<tr>" +
      "<td>" + (esc(m.l) || '<span class="muted">(no label)</span>') + " " + tags + "</td>" +
      "<td>" + (esc(m.r) || '<span class="muted">copied by hand</span>') + "</td>" +
      "<td>" + fmt(m.c) + "</td>" +
      '<td><span class="pill ' + cls + '">' + esc(status) + "</span></td>" +
      "</tr>";
  }
  if (!trs) {
    trs = '<tr><td colspan="4" class="muted" style="text-align:center;padding:2rem">No secrets sent yet.</td></tr>';
  }
  const body =
    '<div class="card">' +
    '<div class="hist-head"><h1>Send History</h1>' +
    '<a class="btn secondary" href="/admin">New Secure Link</a></div>' +
    '<p class="lede">Your last 200 secrets (metadata only, never the secret itself). ' +
    "Rows disappear 30 days after creation.</p>" +
    '<div class="tablewrap"><table class="hist">' +
    "<thead><tr><th>Label</th><th>Recipient</th><th>Created</th><th>Status</th></tr></thead>" +
    "<tbody>" + trs + "</tbody></table></div>" +
    "</div>";
  return shell("Send History | Forge RPA Secure Share", body, null);
}

// ---------------------------------------------------------------------------
// Browser scripts. Written with string concatenation (no template literals /
// backticks) so they embed cleanly as strings here. These run on the client;
// this is where AES-256-GCM and the PBKDF2 passphrase wrap/unwrap happen.
// PBKDF2 iterations must match between create and reveal.
// ---------------------------------------------------------------------------

export const CREATE_JS = `(function(){
  "use strict";
  var PBKDF2_ITER=210000;
  var mode="text";
  var deliveryMode="separate";
  var FILE_MAX=51200;
  var $=function(id){return document.getElementById(id);};
  function b64(buf){
    var bytes=new Uint8Array(buf),bin="";
    for(var i=0;i<bytes.length;i++){bin+=String.fromCharCode(bytes[i]);}
    return btoa(bin);
  }
  function b64url(buf){
    return b64(buf).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");
  }
  function ttlLabel(sec){
    if(sec>=604800)return "7 days";
    if(sec>=259200)return "72 hours";
    if(sec>=86400)return "24 hours";
    if(sec>=3600)return "1 hour";
    return Math.round(sec/60)+" minutes";
  }
  function setError(msg){
    var e=$("error");
    e.textContent=msg||"";
    e.style.display=msg?"block":"none";
  }
  function deriveWrapKey(passphrase,salt,usage){
    return crypto.subtle.importKey("raw",new TextEncoder().encode(passphrase),{name:"PBKDF2"},false,["deriveKey"])
      .then(function(base){
        return crypto.subtle.deriveKey(
          {name:"PBKDF2",salt:salt,iterations:PBKDF2_ITER,hash:"SHA-256"},
          base,{name:"AES-GCM",length:256},false,usage);
      });
  }
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
  function parseRecipients(str){
    if(!str)return [];
    var parts=str.split(/[\\s,;]+/),seen={},out=[];
    for(var i=0;i<parts.length;i++){
      var raw=parts[i].trim(),e=raw.toLowerCase();
      if(e&&/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(e)&&!seen[e]){seen[e]=1;out.push(raw);}
    }
    return out;
  }
  function clearForm(){
    $("secret").value="";
    $("passphrase").value="";
    if($("file-input"))$("file-input").value="";
    if($("label"))$("label").value="";
    if($("recipient"))$("recipient").value="";
    if($("alsopass-wrap"))$("alsopass-wrap").style.display="none";
    if($("delivery-wrap"))$("delivery-wrap").style.display="none";
  }
  function showResult(link,ttlSec,passphrase){
    $("form-panel").style.display="none";
    $("result-panel").style.display="block";
    $("single-out").style.display="block";
    $("multi-list").style.display="none";$("multi-list").innerHTML="";
    $("result-title").textContent="Your Secure Link Is Ready";
    $("result-lede").textContent="Share this link with the recipient over your normal channel. It can be opened one time.";
    $("link-out").value=link;
    $("ttl-note").textContent="This link opens once, then it is destroyed. It also expires in "+ttlLabel(ttlSec)+" if it is never opened.";
    if(passphrase){$("pass-value").textContent=passphrase;$("pass-reminder").style.display="block";}
    $("link-out").focus();$("link-out").select();
  }
  function renderMulti(items,passphrase){
    $("form-panel").style.display="none";
    $("result-panel").style.display="block";
    $("single-out").style.display="none";
    $("result-title").textContent="Secure Links Sent";
    $("result-lede").textContent="Each recipient got their own one-time link. Send History shows who opens which.";
    var h="";
    for(var i=0;i<items.length;i++){
      var it=items[i],st,cp="";
      if(it.sent.ok){st='<span class="st ok">Emailed</span>';}
      else{st='<span class="st err">'+(it.sent.reason==="notset"?"Email off":"Failed")+'</span>';cp='<button class="btn mcopy" data-link="'+esc(it.link)+'">Copy Link</button>';}
      h+='<div class="mrow"><span class="who">'+esc(it.recipient)+'</span>'+st+cp+'</div>';
    }
    var ml=$("multi-list");ml.innerHTML=h;ml.style.display="block";
    var btns=ml.querySelectorAll(".mcopy");
    for(var j=0;j<btns.length;j++){(function(b){b.addEventListener("click",function(){
      var link=b.getAttribute("data-link");
      if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(link);}
      b.textContent="Copied";setTimeout(function(){b.textContent="Copy Link";},1500);
    });})(btns[j]);}
    if(passphrase){$("pass-value").textContent=passphrase;$("pass-reminder").style.display="block";}
  }
  function setEmailNote(msg,kind){
    var e=$("email-note");
    if(!e)return;
    e.textContent=msg||"";
    e.className="msg "+(kind||"");
    e.style.display=msg?"block":"none";
  }
  function sendOne(link,to,passphrase,alsoPass,label){
    return fetch("/admin/api/send",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({link:link,to:to,passphrase:passphrase||"",alsoPass:!!alsoPass,label:label||""})
    }).then(function(res){
      if(res.status===503)return {ok:false,reason:"notset"};
      if(!res.ok)return {ok:false,reason:"failed"};
      return {ok:true};
    }).catch(function(){return {ok:false,reason:"failed"};});
  }
  async function encryptAndCreate(payloadJson,meta,passphrase){
    var enc=new TextEncoder();
    var contentKey=await crypto.subtle.generateKey({name:"AES-GCM",length:256},true,["encrypt","decrypt"]);
    var iv=crypto.getRandomValues(new Uint8Array(12));
    var ctBuf=await crypto.subtle.encrypt({name:"AES-GCM",iv:iv},contentKey,enc.encode(payloadJson));
    var rawKey=await crypto.subtle.exportKey("raw",contentKey);
    var ttl=parseInt($("ttl").value,10);
    var res=await fetch("/admin/api/create",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ct:b64(ctBuf),iv:b64(iv.buffer),ttl:ttl,label:meta.label,to:meta.to,hasPass:!!passphrase,hasFile:meta.hasFile})
    });
    if(res.status===403)throw "You are not authorized to create links here.";
    if(res.status===429)throw "Too many links were created from here. Wait a few minutes and try again.";
    if(res.status===413)throw "That is too large. Keep secrets under about 90 KB and files under 50 KB.";
    if(!res.ok)throw "Something went wrong creating the link. Please try again.";
    var data=await res.json();
    var frag;
    if(passphrase){
      var salt=crypto.getRandomValues(new Uint8Array(16));
      var wrapIv=crypto.getRandomValues(new Uint8Array(12));
      var wrapKey=await deriveWrapKey(passphrase,salt,["encrypt"]);
      var wrapped=await crypto.subtle.encrypt({name:"AES-GCM",iv:wrapIv},wrapKey,rawKey);
      frag=data.id+".P."+b64url(salt.buffer)+"."+b64url(wrapIv.buffer)+"."+b64url(wrapped);
    }else{
      frag=data.id+"."+b64url(rawKey);
    }
    return {link:location.origin+"/s#"+frag,ttl:data.ttl||ttl};
  }
  function buildPayload(){
    // Returns a Promise for the JSON envelope string to encrypt, or rejects
    // with a user-facing message string. The server never sees this; it is
    // encrypted client-side just like a plain secret.
    if(mode==="file"){
      var f=$("file-input").files[0];
      if(!f){return Promise.reject("Choose a file to share.");}
      if(f.size>FILE_MAX){return Promise.reject("That file is too large. Keep files under 50 KB (keys and small configs).");}
      return f.arrayBuffer().then(function(buf){
        return JSON.stringify({k:"f",n:f.name,m:f.type||"application/octet-stream",b:b64(buf)});
      });
    }
    var secret=$("secret").value;
    if(!secret){return Promise.reject("Enter a secret to share.");}
    return Promise.resolve(JSON.stringify({k:"t",b:secret}));
  }
  function onCreate(){
    setError("");setEmailNote("","");
    var passphrase=$("passphrase").value;
    var label=$("label")?$("label").value:"";
    var raw=$("recipient")?$("recipient").value.trim():"";
    var recipients=parseRecipients(raw);
    var alsoPass=$("alsopass")&&$("alsopass").checked;
    if(raw&&recipients.length===0){setError("Those recipient emails do not look valid. Use full addresses separated by commas.");return;}
    var btn=$("create-btn");btn.disabled=true;btn.textContent="Encrypting...";
    (async function(){
      try{
        var payloadJson=await buildPayload();
        if(recipients.length>1&&deliveryMode==="separate"){
          btn.textContent="Creating "+recipients.length+" links...";
          var items=[];
          for(var i=0;i<recipients.length;i++){
            var r=recipients[i];
            var made=await encryptAndCreate(payloadJson,{label:label,to:r,hasFile:(mode==="file")},passphrase);
            var st=await sendOne(made.link,r,passphrase,alsoPass,label);
            items.push({recipient:r,link:made.link,sent:st});
          }
          clearForm();
          renderMulti(items,passphrase);
        }else{
          var toMeta=recipients.length?recipients.join(", "):"";
          var one=await encryptAndCreate(payloadJson,{label:label,to:toMeta,hasFile:(mode==="file")},passphrase);
          clearForm();
          showResult(one.link,one.ttl,passphrase);
          if(recipients.length){
            var shared=recipients.length>1;
            setEmailNote("Emailing "+recipients.length+" recipient"+(recipients.length>1?"s":"")+"...","warn");
            var oks=0,fails=0,notset=false;
            for(var j=0;j<recipients.length;j++){
              var s=await sendOne(one.link,recipients[j],passphrase,alsoPass,label);
              if(s.ok){oks++;}else{fails++;if(s.reason==="notset")notset=true;}
            }
            if(notset&&oks===0){setEmailNote("Email is not set up yet. Copy the link and send it yourself.","warn");}
            else if(fails){setEmailNote("Emailed "+oks+" of "+recipients.length+"; some failed. Copy the link and send it to the rest.","warn");}
            else{setEmailNote("Link emailed to "+recipients.length+" recipient"+(recipients.length>1?"s":"")+"."+(shared?" First to open it wins; then it is destroyed for the rest.":"")+((alsoPass&&passphrase)?" Passphrase sent separately.":""),"ok");}
          }
        }
      }catch(e){
        if(typeof e==="string"){setError(e);}
        else{setError("Your browser blocked encryption. Secure Share needs a modern browser over HTTPS.");}
      }finally{
        btn.disabled=false;btn.textContent="Create Secure Link";
      }
    })();
  }
  function copyFrom(elGetter,btnId,restore){
    var text=elGetter();
    var done=function(){
      var b=$(btnId);
      b.textContent="Copied";
      setTimeout(function(){b.textContent=restore;},1500);
    };
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done,done);
    }else{done();}
  }
  function onAnother(){
    $("result-panel").style.display="none";
    $("pass-reminder").style.display="none";
    if($("multi-list")){$("multi-list").style.display="none";$("multi-list").innerHTML="";}
    if($("single-out"))$("single-out").style.display="block";
    setEmailNote("","");
    $("form-panel").style.display="block";
    $("secret").focus();
  }
  document.addEventListener("DOMContentLoaded",function(){
    $("create-btn").addEventListener("click",onCreate);
    $("copy-btn").addEventListener("click",function(){copyFrom(function(){return $("link-out").value;},"copy-btn","Copy Link");});
    $("copy-pass-btn").addEventListener("click",function(){copyFrom(function(){return $("pass-value").textContent;},"copy-pass-btn","Copy");});
    $("another-btn").addEventListener("click",onAnother);
    var onRecipInput=function(){
      var recs=parseRecipients($("recipient")?$("recipient").value:"");
      if($("delivery-wrap"))$("delivery-wrap").style.display=recs.length>1?"block":"none";
      var show=$("passphrase").value&&$("recipient").value;
      if($("alsopass-wrap"))$("alsopass-wrap").style.display=show?"block":"none";
      if(!show&&$("alsopass"))$("alsopass").checked=false;
    };
    if($("passphrase"))$("passphrase").addEventListener("input",onRecipInput);
    if($("recipient"))$("recipient").addEventListener("input",onRecipInput);
    var dseg=$("delivery-seg");
    if(dseg){dseg.addEventListener("click",function(e){
      var b=e.target.closest("[data-dmode]");if(!b)return;
      deliveryMode=b.getAttribute("data-dmode");
      var bs=dseg.querySelectorAll(".seg-btn");
      for(var i=0;i<bs.length;i++)bs[i].classList.toggle("active",bs[i]===b);
      if($("delivery-hint"))$("delivery-hint").textContent=deliveryMode==="separate"?"Each recipient gets their own one-time link. Everyone can retrieve it once, and Send History shows who opened which.":"One shared link to everyone. The first person to open it gets the secret; it is then destroyed for the rest (best paired with a passphrase).";
    });}
    var seg=$("mode-seg");
    if(seg){seg.addEventListener("click",function(e){
      var b=e.target.closest("[data-mode]");
      if(!b)return;
      mode=b.getAttribute("data-mode");
      var btns=seg.querySelectorAll(".seg-btn");
      for(var i=0;i<btns.length;i++){btns[i].classList.toggle("active",btns[i]===b);}
      $("text-field").style.display=(mode==="text")?"block":"none";
      $("file-field").style.display=(mode==="file")?"block":"none";
      setError("");
    });}
    if(!window.crypto||!window.crypto.subtle){
      setError("This browser does not support the Web Crypto API. Open Secure Share in a modern browser over HTTPS.");
      $("create-btn").disabled=true;
    }
  });
})();`;

export const REVEAL_JS = `(function(){
  "use strict";
  var PBKDF2_ITER=210000;
  var $=function(id){return document.getElementById(id);};
  var parsed=null;
  function fromB64(str){
    var bin=atob(str),b=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++){b[i]=bin.charCodeAt(i);}
    return b;
  }
  function fromB64url(str){
    str=str.replace(/-/g,"+").replace(/_/g,"/");
    while(str.length%4){str+="=";}
    return fromB64(str);
  }
  function setStatus(msg,kind){
    var s=$("status");
    s.textContent=msg||"";
    s.style.display=msg?"block":"none";
    s.className="msg "+(kind||"");
  }
  function hideReveal(){$("reveal-panel").style.display="none";}
  function deriveWrapKey(passphrase,salt,usage){
    return crypto.subtle.importKey("raw",new TextEncoder().encode(passphrase),{name:"PBKDF2"},false,["deriveKey"])
      .then(function(base){
        return crypto.subtle.deriveKey(
          {name:"PBKDF2",salt:salt,iterations:PBKDF2_ITER,hash:"SHA-256"},
          base,{name:"AES-GCM",length:256},false,usage);
      });
  }
  function parseFragment(){
    var hash=location.hash.slice(1);
    if(!hash)return null;
    var parts=hash.split(".");
    if(parts.length===2&&parts[0]&&parts[1]){return {mode:"plain",id:parts[0],key:parts[1]};}
    if(parts.length===5&&parts[1]==="P"&&parts[0]){return {mode:"pass",id:parts[0],salt:parts[2],wrapIv:parts[3],wrapped:parts[4]};}
    return null;
  }
  var fileBlobUrl=null;
  function showText(text){
    $("text-out-wrap").style.display="block";
    // textarea.value, never innerHTML: a hostile secret cannot inject markup.
    $("secret-out").value=text;
    var rows=Math.min(14,Math.max(3,text.split("\\n").length+1));
    $("secret-out").rows=rows;
  }
  function humanSize(n){
    if(n<1024)return n+" B";
    if(n<1048576)return (n/1024).toFixed(1)+" KB";
    return (n/1048576).toFixed(1)+" MB";
  }
  function showFile(name,mime,dataB64){
    var bytes=fromB64(dataB64);
    fileBlobUrl=URL.createObjectURL(new Blob([bytes],{type:mime||"application/octet-stream"}));
    $("file-out-wrap").style.display="block";
    $("file-name").textContent=name||"download";
    $("file-size").textContent=humanSize(bytes.length);
    $("download-btn").onclick=function(){
      var a=document.createElement("a");
      a.href=fileBlobUrl;a.download=name||"download";
      document.body.appendChild(a);a.click();document.body.removeChild(a);
    };
  }
  function showPayload(plaintext){
    hideReveal();
    $("secret-panel").style.display="block";
    var env=null;
    try{env=JSON.parse(plaintext);}catch(e){env=null;}
    if(env&&env.k==="f"){showFile(env.n,env.m,env.b);}
    else if(env&&env.k==="t"){showText(env.b);}
    else{showText(plaintext);} // older non-enveloped links: treat as plain text
    setStatus("This secret has now been destroyed. Reloading this page will not bring it back.","ok");
  }
  async function fetchAndDecrypt(id,contentKey){
    var res=await fetch("/api/reveal",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:id})
    });
    if(res.status===410){hideReveal();setStatus("This secret has already been viewed or has expired. It no longer exists.","err");return;}
    if(res.status===429){setStatus("Too many attempts. Wait a moment and try again.","err");return;}
    if(!res.ok){setStatus("Something went wrong. Please try again.","err");return;}
    var data=await res.json();
    var pt;
    try{
      pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(data.iv)},contentKey,fromB64(data.ct));
    }catch(e){
      hideReveal();
      setStatus("Could not decrypt this secret. The link may be corrupted.","err");
      return;
    }
    try{history.replaceState(null,"",location.pathname);}catch(e){}
    showPayload(new TextDecoder().decode(pt));
  }
  function onReveal(){
    var btn=$("reveal-btn");
    setStatus("","");
    if(!parsed){setStatus("This link is missing its decryption key. Ask the sender to resend the full link.","err");return;}
    btn.disabled=true;btn.textContent="Revealing...";
    (async function(){
      try{
        var contentKey;
        if(parsed.mode==="pass"){
          var pass=$("passphrase-in").value;
          if(!pass){setStatus("Enter the passphrase the sender gave you.","warn");return;}
          var wrapKey=await deriveWrapKey(pass,fromB64url(parsed.salt),["decrypt"]);
          var rawKey;
          try{
            // Verify the passphrase locally BEFORE any server fetch, so a wrong
            // passphrase never burns the secret.
            rawKey=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64url(parsed.wrapIv)},wrapKey,fromB64url(parsed.wrapped));
          }catch(e){
            setStatus("Incorrect passphrase. Check it with the sender and try again. Your try did not destroy the secret.","err");
            return;
          }
          contentKey=await crypto.subtle.importKey("raw",rawKey,{name:"AES-GCM"},false,["decrypt"]);
        }else{
          try{
            contentKey=await crypto.subtle.importKey("raw",fromB64url(parsed.key),{name:"AES-GCM"},false,["decrypt"]);
          }catch(e){
            setStatus("This link appears corrupted or incomplete. Ask the sender to resend the full link.","err");
            return;
          }
        }
        await fetchAndDecrypt(parsed.id,contentKey);
      }catch(e){
        setStatus("Your browser blocked decryption. Secure Share needs a modern browser over HTTPS.","err");
      }finally{
        var b=$("reveal-btn");
        if(b){b.disabled=false;b.textContent="Reveal Secret";}
      }
    })();
  }
  function onCopy(){
    var out=$("secret-out");
    var done=function(){
      var b=$("copy-secret-btn");
      b.textContent="Copied";
      setTimeout(function(){b.textContent="Copy Secret";},1500);
    };
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(out.value).then(done,function(){out.select();done();});
    }else{out.select();try{document.execCommand("copy");}catch(e){}done();}
  }
  document.addEventListener("DOMContentLoaded",function(){
    var rb=$("reveal-btn");
    if(rb)rb.addEventListener("click",onReveal);
    var cb=$("copy-secret-btn");
    if(cb)cb.addEventListener("click",onCopy);
    if(!window.crypto||!window.crypto.subtle){
      setStatus("This browser does not support the Web Crypto API. Open this link in a modern browser over HTTPS.","err");
      if(rb)rb.disabled=true;
      return;
    }
    parsed=parseFragment();
    if(!parsed){
      setStatus("This link is missing its decryption key. Ask the sender to resend the full link.","err");
      if(rb)rb.disabled=true;
      return;
    }
    if(parsed.mode==="pass"){
      $("pass-field").style.display="block";
    }
  });
})();`;

// ===========================================================================
// INBOUND: Secure Requests. The reverse direction of the tool above. David
// mints a REQUEST (a list of fields + an ephemeral ECDH P-256 public key); an
// outside party submits credentials encrypted to that key (ECDH-ES + HKDF, one
// AES-256-GCM content key per submission); David claims and decrypts them with
// the private key that lived only in his Claim Link fragment. The server only
// ever holds ciphertext and public keys. Pages + scripts mirror the outbound
// side's branding, CSP posture (external same-origin scripts, no inline JS),
// and reveal-on-click burn discipline.
// ===========================================================================

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtCT(sec) {
  if (!sec) return "";
  try {
    return (
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(sec * 1000)) + " CT"
    );
  } catch (e) {
    return new Date(sec * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  }
}

// A small lock glyph for secret-field labels (sized via the .lock CSS rule).
const LOCK_MINI =
  '<svg class="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

// The Credential template shown by default on the mint page. David can add,
// remove, rename, and flip the secret flag on any row before creating.
const CREDENTIAL_TEMPLATE = [
  { label: "Username", secret: false },
  { label: "Password", secret: true },
  { label: "Company ID", secret: true },
  { label: "Sender ID", secret: true },
  { label: "API Endpoint", secret: false },
  { label: "Notes", secret: false },
];

function mintFieldRow(label, secret) {
  return (
    '<div class="fieldrow">' +
    '<input type="text" class="flabel" maxlength="80" value="' + escHtml(label) + '" ' +
    'placeholder="Field label, e.g. Password">' +
    '<label class="secretbox"><input type="checkbox" class="fsecret"' + (secret ? " checked" : "") + "> Secret</label>" +
    '<button type="button" class="btn rm" aria-label="Remove field">Remove</button>' +
    "</div>"
  );
}

// GET /admin/request -- David mints an inbound request. Access-gated at the edge.
export function renderRequestMintPage() {
  let rows = "";
  for (const f of CREDENTIAL_TEMPLATE) rows += mintFieldRow(f.label, f.secret);
  const body =
    '<div class="card">' +
    '<div id="form-panel">' +
    "<h1>Request Credentials Securely</h1>" +
    '<p class="lede">Ask an outside party (a client, a vendor) to send you passwords, keys, or ' +
    "connection strings without anything sensitive touching email. They fill in a short form; it " +
    "is encrypted in their browser to a key only you hold.</p>" +
    '<div class="field">' +
    '<label for="req-title">What You Are Requesting</label>' +
    '<input id="req-title" type="text" maxlength="200" autocomplete="off" ' +
    'placeholder="e.g. Sage Web Services Credentials for MRCO">' +
    '<p class="hint">Shown to the outside party and in your Requests list. Never encrypted; keep it ' +
    "free of anything sensitive.</p>" +
    "</div>" +
    '<div class="field">' +
    "<label>Fields to Collect</label>" +
    '<div class="fieldlist" id="fieldlist">' + rows + "</div>" +
    '<button type="button" id="add-field" class="btn addfield">Add Field</button>' +
    '<p class="hint">Mark a field <strong>Secret</strong> to have it entered and shown masked. ' +
    "Started from a credential template; change it however you need.</p>" +
    "</div>" +
    '<div class="field">' +
    '<label for="req-ttl">Expires After</label>' +
    '<select id="req-ttl">' +
    '<option value="3600">1 Hour</option>' +
    '<option value="86400">24 Hours</option>' +
    '<option value="259200" selected>72 Hours</option>' +
    '<option value="604800">7 Days</option>' +
    "</select>" +
    '<p class="hint">The Submit Link stops working after this. A submission you have not claimed is ' +
    "also destroyed at this time, so claim it before then.</p>" +
    "</div>" +
    '<button id="req-create-btn" class="btn">Create Request</button>' +
    '<div id="req-error" class="msg err"></div>' +
    '<div class="assure">' +
    LOCK_ICON +
    "<span>Zero knowledge. A request keypair is generated in your browser. Only the public half is " +
    "stored, so the sender can encrypt to it; the private half goes only into your Claim Link and " +
    "never reaches our servers.</span>" +
    "</div>" +
    '<p class="note" style="margin-top:1.25rem"><a href="/admin/requests">View Requests</a> ' +
    '&middot; <a href="/admin">Send a Secret Instead</a></p>' +
    "</div>" +
    '<div id="result-panel" style="display:none">' +
    "<h1>Your Request Is Ready</h1>" +
    '<p class="lede">Send the Submit Link to the outside party. Keep the Claim Link; it is the only ' +
    "way to read what comes back.</p>" +
    '<div class="reqlink first">' +
    '<label for="submit-out">Submit Link (Send This)</label>' +
    '<div class="outbox"><div class="row">' +
    '<input id="submit-out" type="text" readonly>' +
    '<button id="copy-submit" class="btn">Copy</button>' +
    "</div></div>" +
    '<p class="cap"><strong>Send this to the outside party.</strong> They fill in the fields; nothing ' +
    "sensitive touches email. It works once, then it closes.</p>" +
    '<div id="qr-wrap" class="qrwrap" style="display:none">' +
    '<div id="qr-svg" aria-hidden="false"></div>' +
    '<p class="cap">Scan to open the Submit Link on a phone.</p>' +
    "</div>" +
    "</div>" +
    '<div class="reqlink">' +
    '<label for="claim-out">Claim Link (Keep This)</label>' +
    '<div class="outbox"><div class="row">' +
    '<input id="claim-out" type="text" readonly>' +
    '<button id="copy-claim" class="btn">Copy</button>' +
    '<a id="open-claim" class="btn secondary" target="_blank" rel="noopener" style="text-decoration:none">Open</a>' +
    "</div></div>" +
    '<p class="cap"><strong>The only way to read what comes back.</strong> Save it now (a password ' +
    "manager is ideal). It is also stored in this browser for convenience. If you lose it, the " +
    "submission cannot be recovered.</p>" +
    "</div>" +
    '<div class="btn-row">' +
    '<button id="req-another-btn" class="btn secondary">Create Another</button>' +
    '<a class="btn secondary" href="/admin/requests" style="text-decoration:none">View Requests</a>' +
    "</div>" +
    "</div>" +
    "</div>";
  return shell("Forge RPA Secure Requests", body, "/admin/request.js");
}

// Server-rendered generic error for an invalid, used, or expired submit link.
// Identical for every failure so it is not an enumeration oracle.
export function renderRequestError() {
  const body =
    '<div class="card">' +
    "<h1>This Request Link Is Not Available</h1>" +
    '<p class="lede">This link is invalid, has already been used, or has expired. If you were asked ' +
    "to send credentials, reply to the person who sent you the link and ask for a new one.</p>" +
    "</div>";
  return shell("Not Available | Forge RPA Secure Share", body, null);
}

function submitFieldHtml(label, secret, idx) {
  if (secret) {
    return (
      '<div class="reqfield">' +
      "<label>" + LOCK_MINI + "<span>" + escHtml(label) + "</span></label>" +
      '<div class="pwrap">' +
      '<input class="fval" data-idx="' + idx + '" type="password" autocomplete="off" ' +
      'autocorrect="off" autocapitalize="off" spellcheck="false">' +
      '<button type="button" class="btn toggle">Show</button>' +
      "</div>" +
      "</div>"
    );
  }
  return (
    '<div class="reqfield">' +
    "<label><span>" + escHtml(label) + "</span></label>" +
    '<input class="fval" data-idx="' + idx + '" type="text" autocomplete="off">' +
    "</div>"
  );
}

// GET /r/<token> -- the public submit form. spec = { token, title, fields, pubJwk }.
export function renderSubmitPage(env, spec) {
  let fieldsHtml = "";
  for (let i = 0; i < spec.fields.length; i++) {
    fieldsHtml += submitFieldHtml(spec.fields[i].label, !!spec.fields[i].secret, i);
  }
  // Non-executable data island: the token, field spec, and request public key the
  // client script needs. `<` is escaped so it cannot close the script element.
  const dataJson = JSON.stringify({
    token: spec.token,
    fields: spec.fields.map((f) => ({ label: f.label, secret: !!f.secret })),
    pubJwk: spec.pubJwk,
  }).replace(/</g, "\\u003c");
  const body =
    '<div class="card">' +
    '<div id="form-panel">' +
    "<h1>" + escHtml(spec.title || "Submit Requested Information") + "</h1>" +
    '<p class="lede">Forge RPA asked you to share the information below. It is encrypted in your ' +
    "browser before it is sent, and can be read only by the person who requested it. Forge RPA " +
    "never sees it.</p>" +
    '<div id="fields">' + fieldsHtml + "</div>" +
    '<div id="extra-fields"></div>' +
    '<button type="button" id="add-field" class="btn addfield">Add Field</button>' +
    '<button id="submit-btn" class="btn" style="margin-top:1.25rem">Submit Securely</button>' +
    '<div id="submit-status" class="msg"></div>' +
    '<div class="assure">' +
    LOCK_ICON +
    "<span>Encrypted in your browser with a one-time AES-256 key, then sealed to the requester's " +
    "public key. Forge RPA stores only ciphertext and cannot read what you enter.</span>" +
    "</div>" +
    "</div>" +
    '<div id="done-panel" style="display:none">' +
    "<h1>Submission Received</h1>" +
    '<p class="lede">Your information was encrypted and delivered. This link is now closed and cannot ' +
    "be used again. You can close this page.</p>" +
    "</div>" +
    '<script type="application/json" id="req-data">' + dataJson + "</script>" +
    "</div>";
  return shell("Secure Submission | Forge RPA", body, "/submit.js");
}

// GET /admin/claim -- David reveals a submission. Access-gated at the edge; the
// token + private key ride in the fragment. Reveal-on-click, one atomic burn.
export function renderClaimPage() {
  const body =
    '<div class="card">' +
    '<div id="reveal-panel">' +
    "<h1>Claim a Submission</h1>" +
    '<p class="lede">An outside party submitted encrypted information to one of your requests.</p>' +
    '<div class="reveal-warn"><strong>Read this first.</strong> This can be revealed only once. The ' +
    "moment it is revealed, it is permanently destroyed on the server. Have somewhere ready to save " +
    "it before you continue.</div>" +
    '<button id="claim-btn" class="btn">Reveal Submission</button>' +
    '<div class="assure">' +
    LOCK_ICON +
    "<span>Decrypted here in your browser using the private key from this link. Forge RPA only ever " +
    "stored ciphertext and the sender's one-time public key.</span>" +
    "</div>" +
    "</div>" +
    '<div id="claim-panel" style="display:none">' +
    "<h1>Submitted Information</h1>" +
    '<div class="tablewrap"><table class="kvtable"><tbody id="kv"></tbody></table></div>' +
    "</div>" +
    '<div id="claim-status" class="msg"></div>' +
    "</div>";
  return shell("Claim a Submission | Forge RPA Secure Share", body, "/admin/claim.js");
}

// GET /admin/requests -- status list. rows come from index.js listReqMeta().
function relativeAge(sec, nowSec) {
  const d = Math.max(0, nowSec - sec);
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  const days = Math.floor(d / 86400);
  if (days < 14) return days + (days === 1 ? " day ago" : " days ago");
  return Math.floor(days / 7) + " weeks ago";
}

export function renderRequestsPage(env, rows) {
  const nowSec = Math.floor(Date.now() / 1000);
  const STALE = 604800; // 7 days: an unclaimed submission older than this gets an amber row
  let trs = "";
  for (const m of rows) {
    // A submitted payload never expires (submit-side expiry only), so a submitted
    // row is never Expired; only a still-pending request expires at its TTL.
    let pill, cls, sub = "", trClass = "";
    if (m.s === "claimed") {
      pill = "Claimed";
      cls = "st-claimed";
      sub = m.cl ? fmtCT(m.cl) : "";
    } else if (m.s === "submitted") {
      pill = "Submitted";
      cls = "st-submitted";
      const age = m.su ? relativeAge(m.su, nowSec) : "";
      sub = (age ? age + ", " : "") + "awaiting claim";
      if (m.su && nowSec - m.su > STALE) trClass = ' class="stale"';
    } else if (m.e && m.e < nowSec) {
      pill = "Expired";
      cls = "st-expired";
    } else {
      pill = "Pending";
      cls = "st-pending";
    }
    const statusKey = cls.slice(3); // st-pending -> pending
    const n = m.n || 0;
    const subHtml = sub ? '<div class="muted substatus">' + escHtml(sub) + "</div>" : "";
    // Non-secret spec for the Duplicate action (labels + secret flags, no values).
    const specJson = escHtml(JSON.stringify({ title: m.t || "", fields: Array.isArray(m.sp) ? m.sp : [] }));
    trs +=
      "<tr" + trClass + ">" +
      "<td>" + (escHtml(m.t) || '<span class="muted">(no title)</span>') + "</td>" +
      "<td>" + n + " field" + (n === 1 ? "" : "s") + "</td>" +
      "<td>" + fmtCT(m.c) + "</td>" +
      '<td><span class="pill ' + cls + '">' + pill + "</span>" + subHtml + "</td>" +
      '<td class="actioncell" data-th="' + escHtml(m.th || "") + '" data-status="' + statusKey + '" data-spec="' + specJson + '"></td>' +
      "</tr>";
  }
  if (!trs) {
    trs = '<tr><td colspan="5" class="muted" style="text-align:center;padding:2rem">No requests yet.</td></tr>';
  }
  const body =
    '<div class="card">' +
    '<div class="hist-head"><h1>Secure Requests</h1>' +
    '<a class="btn secondary" href="/admin/request">New Request</a></div>' +
    '<p class="lede">Inbound requests you created (metadata only, never the submitted secret). ' +
    "A submitted request stays until you claim or delete it. Rows disappear 30 days after creation. " +
    "Where this browser has the Claim Link saved, Open Claim and Copy appear below; otherwise use the " +
    "copy you saved at mint.</p>" +
    '<div class="tablewrap"><table class="hist">' +
    "<thead><tr><th>Request</th><th>Fields</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead>" +
    "<tbody>" + trs + "</tbody></table></div>" +
    "</div>";
  return shell("Secure Requests | Forge RPA Secure Share", body, "/admin/requests.js");
}

// ---------------------------------------------------------------------------
// Browser scripts (client-side crypto). Same conventions as CREATE_JS/REVEAL_JS:
// string concatenation, doubled backslashes in regex/newlines, no `${}`.
// Shared shape: ECDH-ES key agreement (P-256) + HKDF-SHA256 -> an AES-256-GCM
// wrapping key for the per-submission content key.
// ---------------------------------------------------------------------------

// Self-contained byte-mode QR encoder (ECC level M, versions 1-6) rendered as an
// inline SVG. Public-domain algorithm (ISO/IEC 18004); no external library, no
// fetch, so it stays inside the strict CSP. Verified against the jsQR decoder.
const QR_JS = `
  var QR=(function(){
    var EXP=new Array(512),LOG=new Array(256);
    (function(){var x=1;for(var i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&0x100)x^=0x11d;}for(var i=255;i<512;i++)EXP[i]=EXP[i-255];})();
    function gmul(a,b){return a===0||b===0?0:EXP[LOG[a]+LOG[b]];}
    function rsGen(deg){var g=[1];for(var i=0;i<deg;i++){var ng=new Array(g.length+1);for(var z=0;z<ng.length;z++)ng[z]=0;for(var j=0;j<g.length;j++){ng[j]^=g[j];ng[j+1]^=gmul(g[j],EXP[i]);}g=ng;}return g;}
    function rsEnc(data,ecLen){var gen=rsGen(ecLen),res=new Array(ecLen);for(var i=0;i<ecLen;i++)res[i]=0;for(var d=0;d<data.length;d++){var factor=data[d]^res[0];res.shift();res.push(0);for(var i2=0;i2<ecLen;i2++)res[i2]^=gmul(gen[i2+1],factor);}return res;}
    var ECC_M={1:[10,1,16],2:[16,1,28],3:[26,1,44],4:[18,2,32],5:[24,2,43],6:[16,4,27]};
    var ALIGN={2:18,3:22,4:26,5:30,6:34};
    function getBit(x,i){return (x>>>i)&1;}
    function encode(text){
      var bytes=[];
      for(var i=0;i<text.length;i++){var c=text.charCodeAt(i);if(c<0x80)bytes.push(c);else if(c<0x800){bytes.push(0xc0|(c>>6),0x80|(c&0x3f));}else{bytes.push(0xe0|(c>>12),0x80|((c>>6)&0x3f),0x80|(c&0x3f));}}
      var version=0;
      for(var v=1;v<=6;v++){var e=ECC_M[v];if(e[1]*e[2]>=bytes.length+2){version=v;break;}}
      if(!version)return null;
      var ecPerBlock=ECC_M[version][0],numBlocks=ECC_M[version][1],dataPerBlock=ECC_M[version][2],totalDataCw=numBlocks*dataPerBlock;
      var bits=[];
      function putBits(val,len){for(var i=len-1;i>=0;i--)bits.push((val>>i)&1);}
      putBits(4,4);putBits(bytes.length,8);
      for(var b=0;b<bytes.length;b++)putBits(bytes[b],8);
      for(var t=0;t<4&&bits.length<totalDataCw*8;t++)bits.push(0);
      while(bits.length%8!==0)bits.push(0);
      var dataCw=[];
      for(var i3=0;i3<bits.length;i3+=8){var byte=0;for(var j=0;j<8;j++)byte=(byte<<1)|bits[i3+j];dataCw.push(byte);}
      var PAD=[0xec,0x11],pp=0;
      while(dataCw.length<totalDataCw)dataCw.push(PAD[pp++%2]);
      var blocks=[],eccs=[];
      for(var bl=0;bl<numBlocks;bl++){var block=dataCw.slice(bl*dataPerBlock,(bl+1)*dataPerBlock);blocks.push(block);eccs.push(rsEnc(block,ecPerBlock));}
      var finalCw=[];
      for(var di=0;di<dataPerBlock;di++)for(var bb=0;bb<numBlocks;bb++)finalCw.push(blocks[bb][di]);
      for(var ei=0;ei<ecPerBlock;ei++)for(var bc=0;bc<numBlocks;bc++)finalCw.push(eccs[bc][ei]);
      var size=17+4*version;
      var mods=[],fn=[];
      for(var r0=0;r0<size;r0++){mods.push(new Array(size));fn.push(new Array(size));for(var c0=0;c0<size;c0++){mods[r0][c0]=0;fn[r0][c0]=false;}}
      function setF(r,c,val){mods[r][c]=val?1:0;fn[r][c]=true;}
      function finder(r,c){for(var dr=-1;dr<=7;dr++)for(var dc=-1;dc<=7;dc++){var rr=r+dr,cc=c+dc;if(rr<0||rr>=size||cc<0||cc>=size)continue;var ring=dr>=0&&dr<=6&&dc>=0&&dc<=6&&(dr===0||dr===6||dc===0||dc===6||(dr>=2&&dr<=4&&dc>=2&&dc<=4));setF(rr,cc,ring);}}
      finder(0,0);finder(0,size-7);finder(size-7,0);
      for(var ti=8;ti<size-8;ti++){setF(6,ti,ti%2===0);setF(ti,6,ti%2===0);}
      if(ALIGN[version]){var a=ALIGN[version];for(var dr2=-2;dr2<=2;dr2++)for(var dc2=-2;dc2<=2;dc2++)setF(a+dr2,a+dc2,Math.max(Math.abs(dr2),Math.abs(dc2))!==1);}
      for(var f1=0;f1<=8;f1++){fn[8][f1]=true;fn[f1][8]=true;}
      for(var f2=0;f2<8;f2++){fn[8][size-1-f2]=true;fn[size-1-f2][8]=true;}
      var idx=0;
      function dataBit(i){return i<finalCw.length*8?getBit(finalCw[i>>3],7-(i&7)):0;}
      for(var col=size-1;col>=1;col-=2){if(col===6)col=5;for(var vert=0;vert<size;vert++){for(var jj=0;jj<2;jj++){var x=col-jj,upward=((col+1)&2)===0,y=upward?size-1-vert:vert;if(!fn[y][x]){mods[y][x]=dataBit(idx);idx++;}}}}
      var maskFns=[function(r,c){return (r+c)%2===0;},function(r){return r%2===0;},function(r,c){return c%3===0;},function(r,c){return (r+c)%3===0;},function(r,c){return (Math.floor(r/2)+Math.floor(c/3))%2===0;},function(r,c){return ((r*c)%2)+((r*c)%3)===0;},function(r,c){return (((r*c)%2)+((r*c)%3))%2===0;},function(r,c){return (((r+c)%2)+((r*c)%3))%2===0;}];
      function applyMask(mfn){var g=[];for(var r=0;r<size;r++){g.push(mods[r].slice());}for(var r2=0;r2<size;r2++)for(var c=0;c<size;c++)if(!fn[r2][c]&&mfn(r2,c))g[r2][c]^=1;return g;}
      function penalty(g){var pen=0;for(var r=0;r<size;r++){var rc=1,cc=1;for(var c=1;c<size;c++){if(g[r][c]===g[r][c-1]){rc++;if(rc===5)pen+=3;else if(rc>5)pen++;}else rc=1;if(g[c][r]===g[c-1][r]){cc++;if(cc===5)pen+=3;else if(cc>5)pen++;}else cc=1;}}for(var r3=0;r3<size-1;r3++)for(var c3=0;c3<size-1;c3++)if(g[r3][c3]===g[r3][c3+1]&&g[r3][c3]===g[r3+1][c3]&&g[r3][c3]===g[r3+1][c3+1])pen+=3;var p1=[1,0,1,1,1,0,1,0,0,0,0],p2=[0,0,0,0,1,0,1,1,1,0,1];for(var r4=0;r4<size;r4++)for(var c4=0;c4<=size-11;c4++){var A=true,B=true,D=true,E=true;for(var k=0;k<11;k++){if(g[r4][c4+k]!==p1[k])A=false;if(g[r4][c4+k]!==p2[k])B=false;if(g[c4+k][r4]!==p1[k])D=false;if(g[c4+k][r4]!==p2[k])E=false;}if(A||B)pen+=40;if(D||E)pen+=40;}var dark=0;for(var r5=0;r5<size;r5++)for(var c5=0;c5<size;c5++)if(g[r5][c5])dark++;pen+=Math.floor(Math.abs((dark*100)/(size*size)-50)/5)*10;return pen;}
      var best=null,bestMask=0,bestPen=Infinity;
      for(var m=0;m<8;m++){var g=applyMask(maskFns[m]);var pen=penalty(g);if(pen<bestPen){bestPen=pen;best=g;bestMask=m;}}
      var fdata=(0<<3)|bestMask,rem=fdata;
      for(var i6=0;i6<10;i6++)rem=(rem<<1)^((rem>>9)*0x537);
      var fmt=((fdata<<10)|rem)^0x5412;
      for(var i7=0;i7<=5;i7++)best[i7][8]=getBit(fmt,i7);
      best[7][8]=getBit(fmt,6);best[8][8]=getBit(fmt,7);best[8][7]=getBit(fmt,8);
      for(var i8=9;i8<15;i8++)best[8][14-i8]=getBit(fmt,i8);
      for(var i9=0;i9<8;i9++)best[8][size-1-i9]=getBit(fmt,i9);
      for(var i10=8;i10<15;i10++)best[size-15+i10][8]=getBit(fmt,i10);
      best[size-8][8]=1;
      return {size:size,mods:best};
    }
    function svg(text,scale){
      var q=encode(text);if(!q)return null;
      var quiet=4,dim=(q.size+quiet*2)*scale,path="";
      for(var r=0;r<q.size;r++)for(var c=0;c<q.size;c++)if(q.mods[r][c])path+="M"+(c+quiet)*scale+" "+(r+quiet)*scale+"h"+scale+"v"+scale+"h-"+scale+"z";
      return '<svg xmlns="http://www.w3.org/2000/svg" width="'+dim+'" height="'+dim+'" viewBox="0 0 '+dim+" "+dim+'" shape-rendering="crispEdges" role="img" aria-label="QR code for the Submit Link"><rect width="'+dim+'" height="'+dim+'" fill="#ffffff"/><path d="'+path+'" fill="#1a1a2e"/></svg>';
    }
    return {svg:svg};
  })();
`;

export const REQUEST_JS = `(function(){
  "use strict";
  ${QR_JS}
  var $=function(id){return document.getElementById(id);};
  function b64url(buf){
    var bytes=new Uint8Array(buf),bin="";
    for(var i=0;i<bytes.length;i++){bin+=String.fromCharCode(bytes[i]);}
    return btoa(bin).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");
  }
  function sha256b64url(str){
    return crypto.subtle.digest("SHA-256",new TextEncoder().encode(str)).then(function(d){return b64url(d);});
  }
  function setError(msg){var e=$("req-error");e.textContent=msg||"";e.style.display=msg?"block":"none";}
  function addRow(label,secret){
    var wrap=document.createElement("div");
    wrap.className="fieldrow";
    var li=document.createElement("input");li.type="text";li.className="flabel";li.maxLength=80;li.placeholder="Field label, e.g. Password";if(label)li.value=label;
    var lab=document.createElement("label");lab.className="secretbox";
    var cb=document.createElement("input");cb.type="checkbox";cb.className="fsecret";if(secret)cb.checked=true;
    lab.appendChild(cb);lab.appendChild(document.createTextNode(" Secret"));
    var rm=document.createElement("button");rm.type="button";rm.className="btn rm";rm.textContent="Remove";
    rm.addEventListener("click",function(){wrap.parentNode.removeChild(wrap);});
    wrap.appendChild(li);wrap.appendChild(lab);wrap.appendChild(rm);
    $("fieldlist").appendChild(wrap);
  }
  function readFields(){
    var rows=$("fieldlist").querySelectorAll(".fieldrow"),out=[];
    for(var i=0;i<rows.length;i++){
      var label=rows[i].querySelector(".flabel").value.trim();
      var secret=rows[i].querySelector(".fsecret").checked;
      if(label)out.push({label:label.slice(0,80),secret:!!secret});
    }
    return out;
  }
  function copyFrom(id,btnId,restore){
    var v=$(id).value;
    var done=function(){var b=$(btnId);b.textContent="Copied";setTimeout(function(){b.textContent=restore;},1500);};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(v).then(done,done);}
    else{$(id).focus();$(id).select();done();}
  }
  function showResult(token,claimLink,submitLink){
    $("form-panel").style.display="none";
    $("result-panel").style.display="block";
    $("submit-out").value=submitLink;
    $("claim-out").value=claimLink;
    if($("open-claim"))$("open-claim").href=claimLink;
    // QR of the Submit Link (for vendors on a phone). Self-contained inline SVG.
    try{
      var qsvg=QR.svg(submitLink,5);
      if(qsvg&&$("qr-svg")){$("qr-svg").innerHTML=qsvg;if($("qr-wrap"))$("qr-wrap").style.display="block";}
    }catch(e){/* QR is a convenience; ignore failures */}
    // Convenience stash (this browser only), keyed by sha256(token) so the raw
    // token is never persisted or sent anywhere.
    sha256b64url(token).then(function(th){
      try{localStorage.setItem("fsr_claim_"+th,claimLink);}catch(e){}
    });
  }
  function prefillFromDup(){
    var raw=null;try{raw=sessionStorage.getItem("fsr_dup_spec");}catch(e){raw=null;}
    if(!raw)return;
    try{sessionStorage.removeItem("fsr_dup_spec");}catch(e){}
    var spec=null;try{spec=JSON.parse(raw);}catch(e){spec=null;}
    if(!spec)return;
    if(spec.title&&$("req-title"))$("req-title").value=spec.title;
    if(spec.fields&&spec.fields.length){
      $("fieldlist").innerHTML="";
      for(var i=0;i<spec.fields.length;i++){addRow(spec.fields[i].label||"",!!spec.fields[i].secret);}
    }
  }
  function onCreate(){
    setError("");
    var title=$("req-title").value.trim();
    var fields=readFields();
    if(!title){setError("Add a short title so you and the sender know what this is for.");return;}
    if(fields.length===0){setError("Add at least one field to collect.");return;}
    if(fields.length>20){setError("Keep it to 20 fields or fewer.");return;}
    var ttl=parseInt($("req-ttl").value,10);
    var btn=$("req-create-btn");btn.disabled=true;btn.textContent="Creating...";
    (async function(){
      try{
        var pair=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits","deriveKey"]);
        var pubJwk=await crypto.subtle.exportKey("jwk",pair.publicKey);
        var privJwk=await crypto.subtle.exportKey("jwk",pair.privateKey);
        var pub={kty:pubJwk.kty,crv:pubJwk.crv,x:pubJwk.x,y:pubJwk.y};
        var res=await fetch("/admin/api/request-create",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({title:title,fields:fields,ttl:ttl,pubJwk:pub})
        });
        if(res.status===403)throw "You are not authorized to create requests here.";
        if(res.status===429)throw "Too many requests were created from here. Wait a few minutes and try again.";
        if(!res.ok)throw "Something went wrong creating the request. Please try again.";
        var data=await res.json();
        var priv=b64url(new TextEncoder().encode(JSON.stringify(privJwk)));
        var origin=location.origin;
        var submitLink=origin+"/r/"+encodeURIComponent(data.token);
        var claimLink=origin+"/admin/claim#"+data.token+"."+priv;
        showResult(data.token,claimLink,submitLink);
      }catch(e){
        if(typeof e==="string"){setError(e);}
        else{setError("Your browser blocked key generation. Secure Requests needs a modern browser over HTTPS.");}
      }finally{
        btn.disabled=false;btn.textContent="Create Request";
      }
    })();
  }
  function onAnother(){
    $("result-panel").style.display="none";
    $("form-panel").style.display="block";
    $("req-title").value="";
    $("submit-out").value="";$("claim-out").value="";
    setError("");
    $("req-title").focus();
  }
  document.addEventListener("DOMContentLoaded",function(){
    var list=$("fieldlist");
    var initial=list.querySelectorAll(".fieldrow");
    for(var i=0;i<initial.length;i++){(function(row){
      row.querySelector(".rm").addEventListener("click",function(){row.parentNode.removeChild(row);});
    })(initial[i]);}
    $("add-field").addEventListener("click",function(){addRow("",true);});
    $("req-create-btn").addEventListener("click",onCreate);
    $("req-another-btn").addEventListener("click",onAnother);
    $("copy-submit").addEventListener("click",function(){copyFrom("submit-out","copy-submit","Copy");});
    $("copy-claim").addEventListener("click",function(){copyFrom("claim-out","copy-claim","Copy");});
    prefillFromDup();
    if(!window.crypto||!window.crypto.subtle){
      setError("This browser does not support the Web Crypto API. Open Secure Requests in a modern browser over HTTPS.");
      $("req-create-btn").disabled=true;
    }
  });
})();`;

// Shared client crypto (ECDH-ES + HKDF) used by both SUBMIT_JS and CLAIM_JS.
const ECDH_ES_JS = `
  var HKDF_SALT=new TextEncoder().encode("forge-secure-request-hkdf-salt-v1");
  var HKDF_INFO=new TextEncoder().encode("forge-secure-request-ecdh-es-v1");
  function b64(buf){var bytes=new Uint8Array(buf),bin="";for(var i=0;i<bytes.length;i++){bin+=String.fromCharCode(bytes[i]);}return btoa(bin);}
  function b64url(buf){return b64(buf).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");}
  function fromB64(str){var bin=atob(str),b=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++){b[i]=bin.charCodeAt(i);}return b;}
  function fromB64url(str){str=str.replace(/-/g,"+").replace(/_/g,"/");while(str.length%4){str+="=";}return fromB64(str);}
  function deriveWrapKey(privKey,pubKey,usage){
    return crypto.subtle.deriveBits({name:"ECDH",public:pubKey},privKey,256).then(function(bits){
      return crypto.subtle.importKey("raw",bits,"HKDF",false,["deriveKey"]).then(function(hk){
        return crypto.subtle.deriveKey({name:"HKDF",hash:"SHA-256",salt:HKDF_SALT,info:HKDF_INFO},hk,{name:"AES-GCM",length:256},false,usage);
      });
    });
  }`;

export const SUBMIT_JS = `(function(){
  "use strict";
  ${ECDH_ES_JS}
  var $=function(id){return document.getElementById(id);};
  var DATA=null;
  function setStatus(msg,kind){var s=$("submit-status");if(!s)return;s.textContent=msg||"";s.className="msg "+(kind||"");s.style.display=msg?"block":"none";}
  function addExtra(){
    // Two rows: [label | Secret toggle | Remove] then [value (full width) | Show].
    // Keeping Remove out of the .pwrap flex row is what stops the value input from
    // collapsing (a width:100% .btn there would eat all the free space).
    var wrap=document.createElement("div");
    wrap.className="reqfield xrow";
    var top=document.createElement("div");top.className="fieldrow";
    var li=document.createElement("input");li.type="text";li.className="xlabel";li.maxLength=80;li.placeholder="Field label";
    var sec=document.createElement("label");sec.className="secretbox";
    var cb=document.createElement("input");cb.type="checkbox";cb.className="xsecret";
    sec.appendChild(cb);sec.appendChild(document.createTextNode(" Secret"));
    var rm=document.createElement("button");rm.type="button";rm.className="btn rm";rm.textContent="Remove";
    top.appendChild(li);top.appendChild(sec);top.appendChild(rm);
    var pw=document.createElement("div");pw.className="pwrap";pw.style.marginTop=".4rem";
    var val=document.createElement("input");val.type="text";val.className="xval";val.autocomplete="off";
    val.setAttribute("autocorrect","off");val.setAttribute("autocapitalize","off");val.spellcheck=false;val.placeholder="Value";
    var tog=document.createElement("button");tog.type="button";tog.className="btn toggle";tog.textContent="Show";tog.style.display="none";
    pw.appendChild(val);pw.appendChild(tog);
    // Secret toggle drives the value input type + Show button visibility, and the
    // secret flag carried into the encrypted bundle. Default off (plain text).
    cb.addEventListener("change",function(){
      if(cb.checked){val.type="password";tog.style.display="";tog.textContent="Show";}
      else{val.type="text";tog.style.display="none";}
    });
    wrap.appendChild(top);wrap.appendChild(pw);
    $("extra-fields").appendChild(wrap);
    val.focus();
  }
  function collectBundle(){
    var fields=[];
    var reqInputs=$("fields").querySelectorAll(".fval");
    for(var i=0;i<reqInputs.length;i++){
      var idx=parseInt(reqInputs[i].getAttribute("data-idx"),10);
      var spec=DATA.fields[idx]||{label:"Field "+(idx+1),secret:true};
      fields.push({label:spec.label,value:reqInputs[i].value,secret:!!spec.secret});
    }
    var xrows=$("extra-fields").querySelectorAll(".xrow");
    for(var j=0;j<xrows.length;j++){
      var lbl=xrows[j].querySelector(".xlabel").value.trim();
      var v=xrows[j].querySelector(".xval").value;
      var sec=xrows[j].querySelector(".xsecret").checked;
      if(lbl||v){fields.push({label:(lbl||"Additional").slice(0,80),value:v,secret:!!sec});}
    }
    return fields;
  }
  function onSubmit(){
    setStatus("","");
    if(!DATA){setStatus("This page did not load correctly. Refresh and try again.","err");return;}
    var fields=collectBundle();
    var hasValue=false;
    for(var i=0;i<fields.length;i++){if(fields[i].value&&fields[i].value.length){hasValue=true;break;}}
    if(!hasValue){setStatus("Fill in at least one field before submitting.","warn");return;}
    // Requested fields are not removable; a blank one is the signal "I do not have
    // this". Confirm before submitting with any left empty.
    var reqBlank=0,reqAll=$("fields").querySelectorAll(".fval");
    for(var bi=0;bi<reqAll.length;bi++){if(!reqAll[bi].value)reqBlank++;}
    if(reqBlank>0&&!window.confirm(reqBlank+" requested field"+(reqBlank===1?" is":"s are")+" empty. Submit anyway?")){return;}
    var btn=$("submit-btn");btn.disabled=true;btn.textContent="Encrypting...";
    (async function(){
      try{
        var bundleJson=JSON.stringify({v:1,fields:fields});
        var contentKey=await crypto.subtle.generateKey({name:"AES-GCM",length:256},true,["encrypt","decrypt"]);
        var iv=crypto.getRandomValues(new Uint8Array(12));
        var ctBuf=await crypto.subtle.encrypt({name:"AES-GCM",iv:iv},contentKey,new TextEncoder().encode(bundleJson));
        var rawKey=await crypto.subtle.exportKey("raw",contentKey);
        var reqPub=await crypto.subtle.importKey("jwk",DATA.pubJwk,{name:"ECDH",namedCurve:"P-256"},false,[]);
        var eph=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits","deriveKey"]);
        var ephJwk=await crypto.subtle.exportKey("jwk",eph.publicKey);
        var wrapKey=await deriveWrapKey(eph.privateKey,reqPub,["encrypt"]);
        var wrapIv=crypto.getRandomValues(new Uint8Array(12));
        var wrapped=await crypto.subtle.encrypt({name:"AES-GCM",iv:wrapIv},wrapKey,rawKey);
        var res=await fetch("/api/submit",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({token:DATA.token,ct:b64(ctBuf),iv:b64(iv.buffer),wrapped:b64(wrapped),wrapIv:b64(wrapIv.buffer),epk:{kty:ephJwk.kty,crv:ephJwk.crv,x:ephJwk.x,y:ephJwk.y}})
        });
        if(res.status===410){setStatus("This request link is no longer available. It may have already been used or expired. Ask for a new one.","err");btn.textContent="Submit Securely";btn.disabled=false;return;}
        if(res.status===413){setStatus("That is too large. Keep the total under about 90 KB.","err");btn.disabled=false;btn.textContent="Submit Securely";return;}
        if(res.status===429){setStatus("Too many attempts. Wait a moment and try again.","err");btn.disabled=false;btn.textContent="Submit Securely";return;}
        if(!res.ok){setStatus("Something went wrong sending your submission. Please try again.","err");btn.disabled=false;btn.textContent="Submit Securely";return;}
        $("form-panel").style.display="none";
        $("done-panel").style.display="block";
      }catch(e){
        setStatus("Your browser blocked encryption. This page needs a modern browser over HTTPS.","err");
        btn.disabled=false;btn.textContent="Submit Securely";
      }
    })();
  }
  document.addEventListener("DOMContentLoaded",function(){
    try{DATA=JSON.parse($("req-data").textContent);}catch(e){DATA=null;}
    var card=document.querySelector(".card");
    card.addEventListener("click",function(e){
      var t=e.target;
      if(t.classList&&t.classList.contains("toggle")){
        var inp=t.parentNode.querySelector("input");
        if(inp){inp.type=inp.type==="password"?"text":"password";t.textContent=inp.type==="password"?"Show":"Hide";}
      }else if(t.classList&&t.classList.contains("rm")){
        var row=t.closest(".xrow");if(row)row.parentNode.removeChild(row);
      }
    });
    $("add-field").addEventListener("click",addExtra);
    $("submit-btn").addEventListener("click",onSubmit);
    if(!window.crypto||!window.crypto.subtle){
      setStatus("This browser does not support the Web Crypto API. Open this link in a modern browser over HTTPS.","err");
      $("submit-btn").disabled=true;
    }
  });
})();`;

export const CLAIM_JS = `(function(){
  "use strict";
  ${ECDH_ES_JS}
  var $=function(id){return document.getElementById(id);};
  var parsed=null;
  function setStatus(msg,kind){var s=$("claim-status");s.textContent=msg||"";s.className="msg "+(kind||"");s.style.display=msg?"block":"none";}
  function parseFragment(){
    var hash=location.hash.slice(1);
    if(!hash)return null;
    var dot=hash.indexOf(".");
    if(dot<1)return null;
    var token=hash.slice(0,dot),privPart=hash.slice(dot+1);
    if(!token||!privPart)return null;
    try{return {token:token,privJwk:JSON.parse(new TextDecoder().decode(fromB64url(privPart)))};}catch(e){return null;}
  }
  function mask(v){var n=v?v.length:0;if(n<1)return "";return new Array(Math.min(n,24)+1).join("\\u2022");}
  function copyText(text,btn,restore){
    var done=function(){btn.textContent="Copied";setTimeout(function(){btn.textContent=restore;},1500);};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done,done);}else{done();}
  }
  function renderFields(fields){
    var tb=$("kv");tb.innerHTML="";
    for(var i=0;i<fields.length;i++){(function(f){
      var tr=document.createElement("tr");
      var k=document.createElement("td");k.className="k";k.textContent=f.label==null?"":String(f.label);
      var v=document.createElement("td");v.className="v";
      var wrap=document.createElement("div");wrap.className="vwrap";
      var val=document.createElement("div");val.className="vval";
      var value=f.value==null?"":String(f.value);
      var secret=!!f.secret;
      val.textContent=secret?mask(value):value;
      var btns=document.createElement("div");btns.className="vbtns";
      if(secret){
        var shown=false;
        var show=document.createElement("button");show.type="button";show.className="btn minibtn secondary";show.textContent="Show";
        show.addEventListener("click",function(){shown=!shown;val.textContent=shown?value:mask(value);show.textContent=shown?"Hide":"Show";});
        btns.appendChild(show);
      }
      var copy=document.createElement("button");copy.type="button";copy.className="btn minibtn";copy.textContent="Copy";
      copy.addEventListener("click",function(){copyText(value,copy,"Copy");});
      btns.appendChild(copy);
      wrap.appendChild(val);wrap.appendChild(btns);v.appendChild(wrap);
      tr.appendChild(k);tr.appendChild(v);tb.appendChild(tr);
    })(fields[i]);}
  }
  function onReveal(){
    setStatus("","");
    if(!parsed){setStatus("This link is missing its key. Use the full Claim Link you saved.","err");return;}
    var btn=$("claim-btn");btn.disabled=true;btn.textContent="Revealing...";
    (async function(){
      try{
        var res=await fetch("/admin/api/claim",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:parsed.token})});
        if(res.status===410){$("reveal-panel").style.display="none";setStatus("This submission has already been claimed, was never submitted, or has expired. It no longer exists.","err");return;}
        if(res.status===403){setStatus("You are not authorized to claim here. Open this link while signed in.","err");btn.disabled=false;btn.textContent="Reveal Submission";return;}
        if(res.status===429){setStatus("Too many attempts. Wait a moment and try again.","err");btn.disabled=false;btn.textContent="Reveal Submission";return;}
        if(!res.ok){setStatus("Something went wrong. Please try again.","err");btn.disabled=false;btn.textContent="Reveal Submission";return;}
        var data=await res.json();
        var reqPriv=await crypto.subtle.importKey("jwk",parsed.privJwk,{name:"ECDH",namedCurve:"P-256"},false,["deriveBits","deriveKey"]);
        var ephPub=await crypto.subtle.importKey("jwk",data.epk,{name:"ECDH",namedCurve:"P-256"},false,[]);
        var wrapKey=await deriveWrapKey(reqPriv,ephPub,["decrypt"]);
        var rawKey;
        try{rawKey=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(data.wrapIv)},wrapKey,fromB64(data.wrapped));}
        catch(e){$("reveal-panel").style.display="none";setStatus("Could not unwrap this submission. The Claim Link may be for a different request.","err");return;}
        var contentKey=await crypto.subtle.importKey("raw",rawKey,{name:"AES-GCM"},false,["decrypt"]);
        var pt;
        try{pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(data.iv)},contentKey,fromB64(data.ct));}
        catch(e){$("reveal-panel").style.display="none";setStatus("Could not decrypt this submission. It may be corrupted.","err");return;}
        var bundle;
        try{bundle=JSON.parse(new TextDecoder().decode(pt));}catch(e){bundle=null;}
        try{history.replaceState(null,"",location.pathname);}catch(e){}
        $("reveal-panel").style.display="none";
        $("claim-panel").style.display="block";
        renderFields(bundle&&bundle.fields?bundle.fields:[]);
        setStatus("This submission has now been destroyed on the server. Reloading will not bring it back.","ok");
      }catch(e){
        setStatus("Your browser blocked decryption. This page needs a modern browser over HTTPS.","err");
        var b=$("claim-btn");if(b){b.disabled=false;b.textContent="Reveal Submission";}
      }
    })();
  }
  document.addEventListener("DOMContentLoaded",function(){
    var rb=$("claim-btn");
    if(rb)rb.addEventListener("click",onReveal);
    if(!window.crypto||!window.crypto.subtle){setStatus("This browser does not support the Web Crypto API. Open this link in a modern browser over HTTPS.","err");if(rb)rb.disabled=true;return;}
    parsed=parseFragment();
    if(!parsed){setStatus("This link is missing its key. Use the full Claim Link you saved when you created the request.","err");if(rb)rb.disabled=true;}
  });
})();`;

// Enhances the Requests list. The claim link (with its private key) never touches
// the server, so it is recovered CLIENT-SIDE from this browser's localStorage
// stash (keyed by sha256(token), written at mint). For a stashed row: on claimable
// states show the claim link as a clickable anchor + Copy, and always a Delete
// button (which reads the token out of the stashed link). Rows minted elsewhere
// get a muted hint. Fail-silent throughout.
export const REQUESTS_JS = `(function(){
  "use strict";
  function tokenFrom(link){
    try{var h=link.split("#")[1];if(!h)return null;var dot=h.indexOf(".");return dot>0?h.slice(0,dot):null;}catch(e){return null;}
  }
  function copyText(text,btn,restore){
    var done=function(){btn.textContent="Copied";setTimeout(function(){btn.textContent=restore;},1500);};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done,done);}else{done();}
  }
  function del(token,th,row,status){
    var msg=status==="submitted"?"This request has an unclaimed submission. Deleting destroys it permanently. Continue?":null;
    if(msg&&!window.confirm(msg))return;
    fetch("/admin/api/request-cancel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:token})})
      .then(function(res){
        if(res.ok){try{localStorage.removeItem("fsr_claim_"+th);}catch(e){}if(row&&row.parentNode)row.parentNode.removeChild(row);}
        else{window.alert("Could not delete this request. Try again.");}
      }).catch(function(){window.alert("Could not delete this request. Try again.");});
  }
  document.addEventListener("DOMContentLoaded",function(){
    var cells=document.querySelectorAll(".actioncell");
    for(var i=0;i<cells.length;i++){(function(cell){
      var th=cell.getAttribute("data-th");
      var status=cell.getAttribute("data-status");
      var row=cell.closest("tr");
      var link=null;
      try{if(th)link=localStorage.getItem("fsr_claim_"+th);}catch(e){link=null;}
      if(link){
        // Claim link is live only while pending or submitted.
        if(status==="pending"||status==="submitted"){
          var a=document.createElement("a");
          a.href=link;a.target="_blank";a.rel="noopener";a.textContent="Open Claim";a.className="tag";a.style.textDecoration="none";
          cell.appendChild(a);
          var cp=document.createElement("button");cp.type="button";cp.className="btn minibtn secondary";cp.textContent="Copy";cp.style.marginLeft=".4rem";
          (function(l){cp.addEventListener("click",function(){copyText(l,cp,"Copy");});})(link);
          cell.appendChild(cp);
        }
        var token=tokenFrom(link);
        if(token){
          var d=document.createElement("button");d.type="button";d.className="btn minibtn secondary";d.textContent="Delete";d.style.marginLeft=".4rem";
          (function(tok,st){d.addEventListener("click",function(){del(tok,th,row,st);});})(token,status);
          cell.appendChild(d);
        }
      }else{
        var s=document.createElement("span");s.className="muted";s.textContent="Claim link not available in this browser; use the copy saved at mint";
        cell.appendChild(s);
      }
      // Duplicate works for ANY row: it re-mints from the stored non-secret spec,
      // no claim link or live DO needed.
      var specRaw=cell.getAttribute("data-spec");
      if(specRaw){
        var dup=document.createElement("button");dup.type="button";dup.className="btn minibtn secondary";dup.textContent="Duplicate";dup.style.marginLeft=".4rem";
        (function(sr){dup.addEventListener("click",function(){
          try{sessionStorage.setItem("fsr_dup_spec",sr);}catch(e){}
          location.href="/admin/request";
        });})(specRaw);
        cell.appendChild(dup);
      }
    })(cells[i]);}
  });
})();`;
