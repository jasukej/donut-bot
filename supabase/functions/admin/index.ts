/**
 * Admin panel: serves HTML on GET, handles config operations on POST.
 * Used for configuring and testing the donut bot.
 */

import { supabase } from "@shared";
import { corsHeaders } from "@shared";

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };
const HTML_HEADERS = { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(ADMIN_HTML, { headers: HTML_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: JSON_HEADERS });
  }

  try {
    const body = await req.json();
    const action = body.action;

    if (action === "get-config") {
      const result = await supabase.from("config").select("key, value") as unknown as { data: unknown; error: unknown };
      if (result.error) return jsonRes({ error: String(result.error) }, 500);
      return jsonRes({ config: result.data });
    }

    if (action === "update-channel") {
      const channelId = body.channelId?.trim();
      if (!channelId) return jsonRes({ error: "channelId required" }, 400);
      const result = await supabase
        .from("config")
        .update({ value: JSON.stringify(channelId) })
        .eq("key", "round_channel_id") as { error: unknown };
      if (result.error) return jsonRes({ error: String(result.error) }, 500);
      return jsonRes({ ok: true, channelId });
    }

    if (action === "update-interval") {
      const days = Number(body.days);
      if (!days || days < 1) return jsonRes({ error: "days must be a positive number" }, 400);
      const result = await supabase
        .from("config")
        .update({ value: days })
        .eq("key", "pairing_interval_days") as { error: unknown };
      if (result.error) return jsonRes({ error: String(result.error) }, 500);
      return jsonRes({ ok: true, interval_days: days });
    }

    return jsonRes({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return jsonRes({ error: String(err) }, 500);
  }
});

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// ---------------------------------------------------------------------------
// Inline HTML
// ---------------------------------------------------------------------------

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Donut Bot Admin</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f5f5f5; color: #1a1a1a; padding: 2rem; max-width: 640px; margin: 0 auto;
    line-height: 1.5;
  }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .subtitle { color: #666; font-size: 0.875rem; margin-bottom: 2rem; }
  .card {
    background: #fff; border-radius: 12px; padding: 1.25rem 1.5rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 1rem;
  }
  .card h2 { font-size: 1rem; margin-bottom: 0.75rem; }
  label { display: block; font-size: 0.8rem; font-weight: 600; color: #555; margin-bottom: 0.25rem; }
  input, select {
    width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #ddd; border-radius: 8px;
    font-size: 0.9rem; margin-bottom: 0.75rem; background: #fafafa;
  }
  input:focus, select:focus { outline: none; border-color: #7c3aed; box-shadow: 0 0 0 2px rgba(124,58,237,0.15); }
  .row { display: flex; gap: 0.5rem; align-items: end; }
  .row input, .row select { margin-bottom: 0; }
  .row .field { flex: 1; }
  button {
    padding: 0.5rem 1rem; border: none; border-radius: 8px; font-size: 0.85rem;
    font-weight: 600; cursor: pointer; transition: background 0.15s;
  }
  .btn-primary { background: #7c3aed; color: #fff; }
  .btn-primary:hover { background: #6d28d9; }
  .btn-secondary { background: #e5e7eb; color: #1a1a1a; }
  .btn-secondary:hover { background: #d1d5db; }
  .btn-group { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
  .log {
    margin-top: 0.75rem; padding: 0.75rem; background: #f9fafb; border: 1px solid #e5e7eb;
    border-radius: 8px; font-family: "SF Mono", Monaco, Consolas, monospace;
    font-size: 0.78rem; white-space: pre-wrap; max-height: 200px; overflow-y: auto;
    display: none; color: #374151;
  }
  .log.visible { display: block; }
  .log.error { border-color: #fca5a5; background: #fef2f2; color: #991b1b; }
  .log.success { border-color: #86efac; background: #f0fdf4; color: #166534; }
  .current { font-size: 0.8rem; color: #666; margin-bottom: 0.5rem; }
  .current code { background: #f3f4f6; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.78rem; }
  .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #ccc; border-top-color: #7c3aed; border-radius: 50%; animation: spin 0.6s linear infinite; vertical-align: middle; margin-left: 6px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head>
<body>

<h1>Donut Bot Admin</h1>
<p class="subtitle">Configure and test your coffee chat bot</p>

<!-- Config -->
<div class="card">
  <h2>Configuration</h2>
  <div id="current-config" class="current">Loading...</div>

  <label for="channel-input">Channel ID</label>
  <div class="row">
    <div class="field"><input id="channel-input" placeholder="C07ABC1234" /></div>
    <button class="btn-primary" onclick="updateChannel()">Save</button>
  </div>

  <label for="interval-select">Pairing Frequency</label>
  <div class="row">
    <div class="field">
      <select id="interval-select" onchange="onIntervalChange()">
        <option value="7">Every week</option>
        <option value="14">Every 2 weeks</option>
        <option value="21">Every 3 weeks</option>
        <option value="30">Every month</option>
        <option value="custom">Custom...</option>
      </select>
    </div>
    <button class="btn-primary" onclick="updateInterval()">Save</button>
  </div>
  <input id="interval-custom" type="number" min="1" placeholder="Days between rounds" style="display:none" />

  <div id="config-log" class="log"></div>
</div>

<!-- Trigger -->
<div class="card">
  <h2>Trigger Functions</h2>
  <p style="font-size:0.8rem;color:#666;margin-bottom:0.5rem;">Manually run a function to test it. Results appear below.</p>
  <div class="btn-group">
    <button class="btn-secondary" onclick="triggerFn('create-pairs')">Create Pairs</button>
    <button class="btn-secondary" onclick="triggerFn('post-reminder')">Post Reminder</button>
    <button class="btn-secondary" onclick="triggerFn('weekly-summary')">Weekly Summary</button>
  </div>
  <div id="trigger-log" class="log"></div>
</div>

<script>
const BASE = window.location.origin + "/functions/v1";
const ADMIN = window.location.href.replace(/\\/$/, "");

function log(elId, msg, type) {
  const el = document.getElementById(elId);
  el.className = "log visible " + (type || "");
  el.textContent = typeof msg === "string" ? msg : JSON.stringify(msg, null, 2);
}

async function api(body) {
  const res = await fetch(ADMIN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function loadConfig() {
  try {
    const data = await api({ action: "get-config" });
    const cfg = {};
    (data.config || []).forEach(r => cfg[r.key] = r.value);
    const ch = typeof cfg.round_channel_id === "string"
      ? cfg.round_channel_id
      : JSON.stringify(cfg.round_channel_id);
    const interval = Number(cfg.pairing_interval_days) || 7;
    const intervalLabel = { 7: "weekly", 14: "every 2 weeks", 21: "every 3 weeks", 30: "monthly" }[interval] || interval + " days";
    document.getElementById("current-config").innerHTML =
      "Channel: <code>" + (ch || "not set") + "</code> &nbsp; Frequency: <code>" + intervalLabel + " (" + interval + " days)</code>";
    document.getElementById("channel-input").value = ch.replace(/^"|"$/g, "") || "";
    // Match interval to dropdown
    const sel = document.getElementById("interval-select");
    let matched = false;
    for (const opt of sel.options) {
      if (opt.value === String(interval)) { sel.value = String(interval); matched = true; break; }
    }
    if (!matched) {
      sel.value = "custom";
      document.getElementById("interval-custom").style.display = "block";
      document.getElementById("interval-custom").value = interval;
    }
  } catch (e) {
    document.getElementById("current-config").textContent = "Failed to load config";
  }
}

function onIntervalChange() {
  const sel = document.getElementById("interval-select");
  document.getElementById("interval-custom").style.display = sel.value === "custom" ? "block" : "none";
}

async function updateChannel() {
  const channelId = document.getElementById("channel-input").value.trim();
  if (!channelId) return log("config-log", "Enter a channel ID", "error");
  log("config-log", "Saving...");
  const data = await api({ action: "update-channel", channelId });
  if (data.error) return log("config-log", data.error, "error");
  log("config-log", "Channel updated to " + channelId, "success");
  loadConfig();
}

async function updateInterval() {
  const sel = document.getElementById("interval-select");
  const days = sel.value === "custom"
    ? document.getElementById("interval-custom").value.trim()
    : sel.value;
  if (!days || Number(days) < 1) return log("config-log", "Enter a valid number of days", "error");
  log("config-log", "Updating...");
  const data = await api({ action: "update-interval", days: Number(days) });
  if (data.error) return log("config-log", data.error, "error");
  log("config-log", "Pairing interval set to every " + days + " days", "success");
  loadConfig();
}

async function triggerFn(name) {
  const el = document.getElementById("trigger-log");
  el.className = "log visible";
  el.innerHTML = "Running <b>" + name + "</b>... <span class=\\"spinner\\"></span>";
  try {
    const res = await fetch(BASE + "/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    log("trigger-log", data, res.ok ? "success" : "error");
  } catch (e) {
    log("trigger-log", String(e), "error");
  }
}

loadConfig();
</script>
</body>
</html>`;
