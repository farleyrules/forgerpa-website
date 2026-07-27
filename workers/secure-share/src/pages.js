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
.brand .anvil{width:34px; height:34px; display:block}
.brand .name{color:var(--amber); font-weight:800; font-size:1.5rem; letter-spacing:-.01em}
.brand .divider{width:1px; height:22px; background:var(--gray-700)}
.brand .sub{color:var(--gray-300); font-weight:500; font-size:.95rem}
.homelink{color:var(--gray-400); text-decoration:none; font-size:.85rem; font-weight:500}
.homelink:hover{color:#fff}
main{flex:1; width:100%; max-width:640px; margin:0 auto; padding:2.5rem 1.25rem 3rem}
.card{
  background:#fff; border:1px solid var(--line); border-radius:16px;
  padding:2rem; box-shadow:0 10px 25px -12px rgba(26,26,46,.18);
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
@media (max-width:480px){
  main{padding:1.5rem 1rem 2.5rem}
  .card{padding:1.5rem}
  .brand .sub{display:none}
  .outbox .row,.pass-reminder .row{flex-direction:column}
  .outbox .row .btn,.pass-reminder .row .btn{width:100%}
}
`;

const LOCK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

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
    '<span class="anvil">' +
    FAVICON_SVG +
    "</span>" +
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
    '<label for="secret">Secret</label>' +
    '<textarea id="secret" autocomplete="off" autocorrect="off" autocapitalize="off" ' +
    'spellcheck="false" placeholder="Paste the password, key, or connection string to share"></textarea>' +
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
    '<button id="create-btn" class="btn">Create Secure Link</button>' +
    '<div id="error" class="msg err"></div>' +
    '<div class="assure">' +
    LOCK_ICON +
    "<span>Zero knowledge. A random AES-256 key is generated in your browser and placed " +
    "only in the link fragment after the # sign, which browsers never send to a server. " +
    "We store encrypted text and nothing else.</span>" +
    "</div>" +
    "</div>" +
    '<div id="result-panel" style="display:none">' +
    "<h1>Your Secure Link Is Ready</h1>" +
    '<p class="lede">Share this link with the recipient over your normal channel. It can be ' +
    "opened one time.</p>" +
    '<div class="outbox">' +
    '<label for="link-out">One-Time Link</label>' +
    '<div class="row">' +
    '<input id="link-out" type="text" readonly>' +
    '<button id="copy-btn" class="btn">Copy Link</button>' +
    "</div>" +
    '<p id="ttl-note" class="note"></p>' +
    "</div>" +
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
    '<div class="outbox">' +
    '<label for="secret-out">Secret</label>' +
    '<textarea id="secret-out" readonly spellcheck="false"></textarea>' +
    '<div class="btn-row">' +
    '<button id="copy-secret-btn" class="btn">Copy Secret</button>' +
    "</div>" +
    "</div>" +
    "</div>" +
    '<div id="status" class="msg"></div>' +
    "</div>";
  return shell("You Have a Secret | Forge RPA Secure Share", body, "/reveal.js");
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
  function showResult(link,ttlSec,passphrase){
    $("form-panel").style.display="none";
    $("result-panel").style.display="block";
    $("link-out").value=link;
    $("ttl-note").textContent="This link opens once, then it is destroyed. It also expires in "+ttlLabel(ttlSec)+" if it is never opened.";
    if(passphrase){
      $("pass-value").textContent=passphrase;
      $("pass-reminder").style.display="block";
    }
    $("link-out").focus();
    $("link-out").select();
  }
  function onCreate(){
    setError("");
    var secret=$("secret").value;
    if(!secret){setError("Enter a secret to share.");return;}
    var passphrase=$("passphrase").value;
    var btn=$("create-btn");
    btn.disabled=true;btn.textContent="Encrypting...";
    (async function(){
      try{
        var enc=new TextEncoder();
        var contentKey=await crypto.subtle.generateKey({name:"AES-GCM",length:256},true,["encrypt","decrypt"]);
        var iv=crypto.getRandomValues(new Uint8Array(12));
        var ctBuf=await crypto.subtle.encrypt({name:"AES-GCM",iv:iv},contentKey,enc.encode(secret));
        var rawKey=await crypto.subtle.exportKey("raw",contentKey);
        var ttl=parseInt($("ttl").value,10);
        var res=await fetch("/admin/api/create",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ct:b64(ctBuf),iv:b64(iv.buffer),ttl:ttl})
        });
        if(res.status===403){setError("You are not authorized to create links here.");return;}
        if(res.status===429){setError("Too many links were created from here. Wait a few minutes and try again.");return;}
        if(res.status===413){setError("That secret is too large. Keep it under 100 KB.");return;}
        if(!res.ok){setError("Something went wrong creating the link. Please try again.");return;}
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
        var link=location.origin+"/s#"+frag;
        $("secret").value="";
        $("passphrase").value="";
        showResult(link,data.ttl||ttl,passphrase);
      }catch(e){
        setError("Your browser blocked encryption. Secure Share needs a modern browser over HTTPS.");
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
    $("form-panel").style.display="block";
    $("secret").focus();
  }
  document.addEventListener("DOMContentLoaded",function(){
    $("create-btn").addEventListener("click",onCreate);
    $("copy-btn").addEventListener("click",function(){copyFrom(function(){return $("link-out").value;},"copy-btn","Copy Link");});
    $("copy-pass-btn").addEventListener("click",function(){copyFrom(function(){return $("pass-value").textContent;},"copy-pass-btn","Copy");});
    $("another-btn").addEventListener("click",onAnother);
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
  function showSecret(plaintext){
    hideReveal();
    $("secret-panel").style.display="block";
    // textarea.value, never innerHTML: a hostile secret cannot inject markup.
    $("secret-out").value=plaintext;
    var rows=Math.min(14,Math.max(3,plaintext.split("\\n").length+1));
    $("secret-out").rows=rows;
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
    showSecret(new TextDecoder().decode(pt));
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
          contentKey=await crypto.subtle.importKey("raw",fromB64url(parsed.key),{name:"AES-GCM"},false,["decrypt"]);
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
