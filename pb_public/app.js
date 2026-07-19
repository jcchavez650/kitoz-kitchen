/* ============================================================================
   KITOZ BURGER — Kitchen dashboard
   Connects to the PocketBase backend that serves this page, shows live orders,
   and lets staff move them New → Preparing → Ready → Done.
   ========================================================================== */

// PocketBase SDK (real from CDN, or a mock injected for local testing)
let PocketBase = window.__PB_MOCK__;
if (!PocketBase) {
  PocketBase = (await import("https://cdn.jsdelivr.net/npm/pocketbase@0.21.5/dist/pocketbase.es.mjs")).default;
}
const pb = new PocketBase(window.location.origin);
pb.autoCancellation(false);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (n) => "$" + Number(n || 0).toFixed(2);

const NEXT = { new: "preparing", preparing: "ready", ready: "done" };
const NEXT_LABEL = { new: "Start", preparing: "Ready", ready: "Complete" };

/* ---- Sound ------------------------------------------------------------- */
let soundOn = true, actx = null;
function initAudio() { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
function ding() {
  if (!soundOn || !actx) return;
  [880, 1320].forEach((f, i) => {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = f; o.type = "sine"; o.connect(g); g.connect(actx.destination);
    const t = actx.currentTime + i * 0.14;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.start(t); o.stop(t + 0.14);
  });
}

/* ---- Auth -------------------------------------------------------------- */
function showApp(on) { $("#app").hidden = !on; $("#login").hidden = on; }

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  initAudio();
  const btn = $("#loginBtn"); btn.disabled = true; $("#loginErr").hidden = true;
  try {
    await pb.collection("users").authWithPassword($("#email").value.trim(), $("#password").value);
    start();
  } catch (err) {
    $("#loginErr").textContent = "Wrong email or password."; $("#loginErr").hidden = false;
  } finally { btn.disabled = false; }
});

$("#logout").addEventListener("click", () => { pb.authStore.clear(); showApp(false); });

$("#soundToggle").addEventListener("click", () => {
  soundOn = !soundOn; $("#soundToggle").textContent = soundOn ? "🔔 On" : "🔕 Off"; initAudio();
});

/* ---- Order history ----------------------------------------------------- */
async function openHistory() {
  $("#histOverlay").hidden = false;
  $("#histPanel").classList.add("open");
  $("#histBody").innerHTML = `<p class="hist-empty">Loading…</p>`;
  try {
    const res = await pb.collection("orders").getList(1, 100, { sort: "-created" });
    const items = res.items || [];
    const hmap = seqNumbers(items);
    $("#histBody").innerHTML = items.length
      ? items.map((o) => {
          const its = Array.isArray(o.items) ? o.items : [];
          const line = its.map((i) => `${i.qty || 1}× ${esc(i.name)}`).join(", ");
          const t = new Date(o.created).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
          return `<div class="hist-item s-${o.status}">
            <div class="hist-top"><span class="ticket">#${hmap[o.id] != null ? hmap[o.id] : esc(o.id).slice(-4).toUpperCase()}</span>
              <span class="pill s-${o.status}">${o.status}</span><span class="hist-time">${t}</span></div>
            <div class="hist-cust">${esc(o.customer_name || "Guest")}${o.customer_phone ? " · " + esc(o.customer_phone) : ""}</div>
            <div class="hist-items">${line}</div>
            <div class="hist-total">${money(o.total)}</div>
          </div>`;
        }).join("")
      : `<p class="hist-empty">No orders yet.</p>`;
  } catch (e) {
    $("#histBody").innerHTML = `<p class="hist-empty">Couldn't load history.</p>`;
  }
}
function closeHistory() { $("#histPanel").classList.remove("open"); setTimeout(() => ($("#histOverlay").hidden = true), 250); }
$("#historyBtn").addEventListener("click", openHistory);
$("#histClose").addEventListener("click", closeHistory);
$("#histOverlay").addEventListener("click", closeHistory);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeHistory(); });

/* ---- Rendering --------------------------------------------------------- */
function timeAgo(iso) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 1 ? "just now" : mins + "m ago";
}
function itemLine(it) {
  const name = esc(it.name || "");
  const m = name.match(/^(.*?)( — .*| \(.*\))$/);
  const base = m ? m[1] : name;
  const mod = m ? m[2].replace(/^ /, "") : "";
  return `<li><span class="q">${it.qty || 1}×</span> ${base}${mod ? `<span class="mod">${mod}</span>` : ""}</li>`;
}
function cardHTML(o) {
  const items = Array.isArray(o.items) ? o.items : [];
  const phone = o.customer_phone ? `· <a href="tel:${esc(o.customer_phone)}">${esc(o.customer_phone)}</a>` : "";
  return `
    <div class="card s-${o.status} flash" data-id="${o.id}">
      <div class="card-head">
        <span class="ticket">${ticketOf(o)}</span>
        <span class="ago" data-created="${o.created}">${timeAgo(o.created)}</span>
      </div>
      <div class="cust">${esc(o.customer_name || "Guest")} ${phone}</div>
      <ul class="items">${items.map(itemLine).join("")}</ul>
      ${o.notes ? `<p class="note">📝 ${esc(o.notes)}</p>` : ""}
      <div class="card-foot">
        <span class="total">${money(o.total)}</span>
        <div class="acts">
          ${o.status !== "new" ? `<button class="btn undo" data-back="${o.id}">↩</button>` : ""}
          <button class="btn ${o.status === "ready" ? "done" : ""}" data-next="${o.id}" data-status="${o.status}">${NEXT_LABEL[o.status]}</button>
        </div>
      </div>
    </div>`;
}
function render(orders) {
  ["new", "preparing", "ready"].forEach((s) => ($("#col-" + s).innerHTML = ""));
  const active = orders.filter((o) => o.status !== "done").sort((a, b) => new Date(a.created) - new Date(b.created));
  active.forEach((o) => { const col = $("#col-" + o.status); if (col) col.insertAdjacentHTML("beforeend", cardHTML(o)); });
  ["new", "preparing", "ready"].forEach((s) => {
    $("#count-" + s).textContent = active.filter((o) => o.status === s).length;
  });
  $("#empty").hidden = active.length > 0;
  // strip the one-shot flash class after it plays
  setTimeout(() => document.querySelectorAll(".card.flash").forEach((c) => c.classList.remove("flash")), 1100);
}

/* ---- Sequential daily order numbers ------------------------------------ */
// Numbers reset each day: the 1st order of the day is #1, then #2, ...
function seqNumbers(orders) {
  const sorted = [...orders].sort((a, b) => new Date(a.created) - new Date(b.created));
  const perDay = {}, map = {};
  sorted.forEach((o) => { const k = new Date(o.created).toDateString(); perDay[k] = (perDay[k] || 0) + 1; map[o.id] = perDay[k]; });
  return map;
}
let seqMap = {};
function ticketOf(o) { return "#" + (seqMap[o.id] != null ? seqMap[o.id] : esc(o.id).slice(-4).toUpperCase()); }

/* ---- Data -------------------------------------------------------------- */
let knownIds = null;
async function refresh() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const iso = start.toISOString().replace("T", " ");
  try {
    const today = await pb.collection("orders").getFullList({ filter: `created >= "${iso}"`, sort: "created" });
    setConn(true);
    seqMap = seqNumbers(today);
    $("#statCount").textContent = today.length;
    const active = today.filter((o) => o.status !== "done");
    // Ding when a genuinely new order appears (works via realtime OR polling)
    if (knownIds) {
      const fresh = active.filter((o) => o.status === "new" && !knownIds.has(o.id));
      if (fresh.length) ding();
    }
    knownIds = new Set(active.map((o) => o.id));
    render(active);
  } catch (e) { setConn(false); }
}
function setConn(ok) {
  $("#conn").classList.toggle("down", !ok);
  $("#connText").textContent = ok ? "Live" : "Offline";
}

/* ---- Actions ----------------------------------------------------------- */
document.addEventListener("click", async (e) => {
  const next = e.target.closest("[data-next]");
  const back = e.target.closest("[data-back]");
  if (next) {
    const id = next.getAttribute("data-next");
    const status = NEXT[next.getAttribute("data-status")];
    next.disabled = true;
    try { await pb.collection("orders").update(id, { status }); } catch (err) { next.disabled = false; }
    return;
  }
  if (back) {
    const id = back.getAttribute("data-back");
    const card = back.closest(".card");
    const cur = card.className.match(/s-(\w+)/)[1];
    const prev = { preparing: "new", ready: "preparing" }[cur] || "new";
    try { await pb.collection("orders").update(id, { status: prev }); } catch (err) {}
  }
});

/* ---- Live -------------------------------------------------------------- */
let refreshT = null;
function scheduleRefresh() { clearTimeout(refreshT); refreshT = setTimeout(refresh, 120); }

async function start() {
  showApp(true);
  // Show the Reports link only to admins/owners
  const role = pb.authStore.model && pb.authStore.model.role;
  if (role === "admin" || role === "owner") $("#reportsLink").hidden = false;
  await refresh();
  // Realtime push (instant) — best effort; some hosts drop SSE over HTTP/2
  try {
    await pb.collection("orders").subscribe("*", () => scheduleRefresh());
  } catch (e) { setConn(false); }
  // Polling fallback so the board stays live even if realtime SSE fails
  setInterval(refresh, 8000);
  // keep "Xm ago" labels fresh
  setInterval(() => document.querySelectorAll(".ago").forEach((el) => (el.textContent = timeAgo(el.getAttribute("data-created")))), 30000);
}

/* ---- Boot -------------------------------------------------------------- */
if (pb.authStore.isValid) start(); else showApp(false);
