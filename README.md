# Kitoz Burger — Kitchen Dashboard + Backend

A real-time kitchen order screen for Kitoz Burger, powered by **PocketBase**
(database + realtime + auth + admin panel) — deployed on **Railway** from this
repo. Your customer site sends orders here; staff work them New → Preparing →
Ready → Done, live.

```
Customer site (GitHub Pages) ──POST order──► PocketBase on Railway ◄──live──► Kitchen dashboard
```

- `Dockerfile` — builds/runs PocketBase on Railway
- `pb_public/` — the kitchen dashboard (served at the site root)
- `pb_schema.json` — the `orders` collection to import

---

## 1. Deploy on Railway (from GitHub)

1. **Railway → New Project → Deploy from GitHub repo → `kitoz-kitchen`.**
   Railway detects the `Dockerfile` and builds it.
2. **Add a Volume** so orders survive restarts: the service → **Volumes → New Volume**, mount path **`/pb/pb_data`**.
3. Service → **Settings → Networking → Generate Domain**. Copy the public URL
   (e.g. `https://kitoz-kitchen-production.up.railway.app`).

> Tip: set the latest PocketBase version — service → **Variables** → add
> `PB_VERSION` = the newest from https://github.com/pocketbase/pocketbase/releases

## 2. First-run setup (once)

1. Open **`https://YOUR-URL/_/`** → create your **admin** account.
2. **Create the orders collection:** Admin → **Settings → Import collections** →
   paste the contents of `pb_schema.json` → Review → Import.
   *(Or create it by hand: a `base` collection named `orders` with fields
   `items` (json), `customer_name` (text), `customer_phone` (text),
   `notes` (text), `total` (number), `status` (select: new, preparing, ready,
   done). API rules: Create = public (empty), List/View/Update/Delete =
   `@request.auth.id != ""`.)*
3. **Create a staff login:** Admin → **Collections → users → New record** →
   set an email + password. Staff use this to sign into the dashboard.

## 3. Connect your customer site

In the Kitoz Burger site's `js/data.js`, set:

```js
ordersApi: "https://YOUR-URL"   // your Railway PocketBase URL
```

Now every order placed on the site is saved here **and** still opens WhatsApp
(hybrid). Leaving `ordersApi` empty = WhatsApp only (nothing breaks).

## 4. Open the kitchen screen

Go to **`https://YOUR-URL/`** on a tablet/phone in the kitchen, sign in with the
staff account, and orders appear live with a sound alert. Buttons move each
order **Start → Ready → Complete**; the top bar shows today's order count and
revenue.
