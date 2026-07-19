/* ============================================================================
   KITOZ BURGER — Admin / reporting
   Revenue and order reporting for owners/managers. Requires an admin role.
   ========================================================================== */
let PocketBase = window.__PB_MOCK__;
if (!PocketBase) {
  PocketBase = (await import("https://cdn.jsdelivr.net/npm/pocketbase@0.21.5/dist/pocketbase.es.mjs")).default;
}
const pb = new PocketBase(window.location.origin);
pb.autoCancellation(false);

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (n) => "$" + Number(n || 0).toFixed(2);
const money0 = (n) => "$" + Math.round(Number(n || 0)).toLocaleString();

function showApp(on) { $("#app").hidden = !on; $("#login").hidden = on; }
function isAdmin() { const m = pb.authStore.model; return m && (m.role === "admin" || m.role === "owner"); }

/* ---- Auth -------------------------------------------------------------- */
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#loginBtn"); btn.disabled = true; $("#loginErr").hidden = true;
  try {
    await pb.collection("users").authWithPassword($("#email").value.trim(), $("#password").value);
    enter();
  } catch (err) { $("#loginErr").textContent = "Wrong email or password."; $("#loginErr").hidden = false; }
  finally { btn.disabled = false; }
});
$("#logout").addEventListener("click", () => { pb.authStore.clear(); showApp(false); });
$("#refresh").addEventListener("click", loadReport);

/* ---- Helpers ----------------------------------------------------------- */
const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const baseName = (n) => String(n || "").split(/ — | \(/)[0].trim();

/* ---- Report ------------------------------------------------------------ */
async function loadReport() {
  let orders = [];
  try { orders = await pb.collection("orders").getFullList({ sort: "-created" }); }
  catch (e) { return; }

  const now = Date.now();
  const t0 = dayStart(now).getTime();
  const d7 = now - 7 * 864e5, d30 = now - 30 * 864e5;
  const sum = (arr) => arr.reduce((s, o) => s + (o.total || 0), 0);
  const inRange = (from) => orders.filter((o) => new Date(o.created).getTime() >= from);

  const today = inRange(t0), last7 = inRange(d7), last30 = inRange(d30);
  const avg = orders.length ? sum(orders) / orders.length : 0;
  set("revToday", money0(sum(today))); set("ordToday", `${today.length} orders`);
  set("rev7", money0(sum(last7)));     set("ord7", `${last7.length} orders`);
  set("rev30", money0(sum(last30)));   set("ord30", `${last30.length} orders`);
  set("revAll", money0(sum(orders)));  set("ordAll", `${orders.length} orders · avg ${money(avg)}`);

  renderChart(orders);
  renderTopItems(last30);
  renderRecent(orders.slice(0, 12));
}
function set(id, v) { $("#" + id).textContent = v; }

function renderChart(orders) {
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = dayStart(Date.now() - i * 864e5); days.push({ d, rev: 0 }); }
  orders.forEach((o) => {
    const ds = dayStart(o.created).getTime();
    const slot = days.find((x) => x.d.getTime() === ds);
    if (slot) slot.rev += o.total || 0;
  });
  const max = Math.max(1, ...days.map((x) => x.rev));
  $("#chart").innerHTML = days.map((x) => {
    const h = Math.round((x.rev / max) * 100);
    const lbl = x.d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2);
    return `<div class="bar" style="height:${Math.max(h, 1)}%" title="${x.d.toLocaleDateString()} — ${money(x.rev)}">
      <b>${x.rev ? "$" + Math.round(x.rev) : ""}</b><span>${lbl}</span></div>`;
  }).join("");
}

function renderTopItems(orders) {
  const map = {};
  orders.forEach((o) => (Array.isArray(o.items) ? o.items : []).forEach((it) => {
    const k = baseName(it.name); if (!k) return;
    map[k] = map[k] || { qty: 0, rev: 0 };
    map[k].qty += it.qty || 1; map[k].rev += (it.qty || 1) * (it.price || 0);
  }));
  const rows = Object.entries(map).sort((a, b) => b[1].rev - a[1].rev).slice(0, 10);
  $("#topItems").innerHTML = rows.length
    ? rows.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="num">${v.qty}</td><td class="num">${money(v.rev)}</td></tr>`).join("")
    : `<tr><td colspan="3" style="color:var(--muted)">No orders yet.</td></tr>`;
}

function renderRecent(orders) {
  $("#recent").innerHTML = orders.length
    ? orders.map((o) => {
        const n = Array.isArray(o.items) ? o.items.reduce((s, i) => s + (i.qty || 1), 0) : 0;
        const t = new Date(o.created).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        return `<tr><td>${t}</td><td>${esc(o.customer_name || "Guest")}</td><td class="num">${n}</td><td class="num">${money(o.total)}</td><td><span class="pill s-${o.status}">${o.status}</span></td></tr>`;
      }).join("")
    : `<tr><td colspan="5" style="color:var(--muted)">No orders yet.</td></tr>`;
}

/* ---- Enter ------------------------------------------------------------- */
function enter() {
  showApp(true);
  if (!isAdmin()) { $("#denied").hidden = false; $("#report").hidden = true; return; }
  $("#denied").hidden = true; $("#report").hidden = false;
  loadReport();
  setInterval(loadReport, 60000);
}

/* ---- Boot -------------------------------------------------------------- */
if (pb.authStore.isValid) enter(); else showApp(false);
