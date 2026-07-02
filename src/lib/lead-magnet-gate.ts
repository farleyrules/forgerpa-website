/**
 * Lead-magnet email gate — resources.astro.
 *
 * The month-end checklist stays a plain, ungated link. The two higher-intent
 * assets (the ROI calculator + the 5-ROI-processes guide) are gated behind a
 * single email field. On submit we POST the email to the sales cockpit so it can
 * enroll the visitor in the Forge newsletter drip (see forgerpa-sales
 * /api/warm-intake/lead-magnet), THEN immediately hand over the download.
 *
 * Guiding rule: the plumbing must never hold a visitor's asset hostage. If the
 * API call fails for any reason (offline, CORS, a privacy shield, a 500), we log
 * nothing and let the download proceed anyway. The person gets the file every
 * time; the drip is a best-effort nicety layered on top.
 *
 * Markup contract (rendered by resources.astro):
 *   <div class="lead-magnet-gate"
 *        data-asset="roi-calculator|five-roi-processes"
 *        data-download="/downloads/<file>"
 *        data-filename="<file>">
 *     <input class="lead-magnet-email" type="email" />
 *     <p class="lead-magnet-error hidden"></p>
 *     <button class="lead-magnet-submit">…</button>
 *   </div>
 */

/** Sales cockpit origin — the public lead-magnet intake endpoint lives here. */
const COCKPIT_ORIGIN = "https://sales.forgerpa.com";

/** Minimal email shape check (mirrors the server's format-only rule). */
function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Trigger a browser download of a same-origin asset. Uses a temporary anchor
 * with the `download` attribute so the file saves rather than navigating away
 * (which would drop the visitor off the resources page). Falls back to a direct
 * navigation if anchor-download is somehow unavailable.
 */
function triggerDownload(url: string, filename: string): void {
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch {
    // Last resort: just open the file. The visitor still gets the asset.
    window.location.href = url;
  }
}

function setError(errorEl: HTMLElement | null, message: string | null): void {
  if (!errorEl) return;
  if (message) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  } else {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }
}

/**
 * Fire the enrollment POST. Never throws and never rejects — resolves whether or
 * not the cockpit was reachable, because the caller proceeds with the download
 * regardless. Deliberately swallows every failure (the "log nothing" rule).
 */
async function enroll(email: string, asset: string): Promise<void> {
  try {
    await fetch(`${COCKPIT_ORIGIN}/api/warm-intake/lead-magnet`, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, asset }),
    });
  } catch {
    /* Never hold the asset hostage to our plumbing. */
  }
}

function bindGate(gate: HTMLElement): void {
  const asset = gate.getAttribute("data-asset") ?? "";
  const downloadUrl = gate.getAttribute("data-download") ?? "";
  const filename = gate.getAttribute("data-filename") ?? "download";
  const input = gate.querySelector<HTMLInputElement>(".lead-magnet-email");
  const button = gate.querySelector<HTMLButtonElement>(".lead-magnet-submit");
  const errorEl = gate.querySelector<HTMLElement>(".lead-magnet-error");

  if (!input || !button || !asset || !downloadUrl) return;

  // Clear a stale error as soon as the visitor edits the field.
  input.addEventListener("input", () => setError(errorEl, null));
  // Enter in the email field submits the gate.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      button.click();
    }
  });

  button.addEventListener("click", () => {
    const email = input.value.trim();
    if (!email) {
      setError(errorEl, "Please enter your email.");
      input.focus();
      return;
    }
    if (!isValidEmail(email)) {
      setError(errorEl, "Please enter a valid email address.");
      input.focus();
      return;
    }
    setError(errorEl, null);

    // Fire-and-forget the enrollment, then hand over the file immediately. We do
    // NOT await the POST before downloading: the visitor gets the asset right
    // away and the drip enrollment happens in the background.
    void enroll(email, asset);
    triggerDownload(downloadUrl, filename);

    // Confirm on the button so the interaction reads as complete.
    button.disabled = true;
    button.textContent = "Download Started";
  });
}

function initLeadMagnetGates(): void {
  const gates = Array.from(
    document.querySelectorAll<HTMLElement>(".lead-magnet-gate"),
  );
  gates.forEach(bindGate);
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLeadMagnetGates);
  } else {
    initLeadMagnetGates();
  }
}

export {};
