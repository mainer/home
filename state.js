/**
 * Cloudflare Pages Function —— /api/state
 *
 * GET  /api/state   → { rev, updatedAt, data }
 * POST /api/state   → { rev, updatedAt }        body: { rev, data, force? }
 *
 * 认证：请求头 x-room-pass 必须等于环境变量 SITE_PASS
 * 存储：KV 绑定 ROOM_KV，键 room-state
 * 冲突：POST 带的 rev 与云端不一致时返回 409 + 云端内容，由前端决定覆盖还是刷新
 */

const KEY = "room-state";
const MAX_BYTES = 24 * 1024 * 1024; // KV 单值上限 25MB，留一点余量

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

function checkPass(request, env) {
  const expected = env.SITE_PASS || "";
  if (!expected) return "pass-missing";
  const got = request.headers.get("x-room-pass") || "";
  if (got.length !== expected.length) return "unauthorized";
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? "ok" : "unauthorized";
}

function guard(context) {
  const { env } = context;
  if (!env.ROOM_KV) return json({ error: "kv-missing", message: "还没绑定 KV：ROOM_KV" }, 500);
  const auth = checkPass(context.request, env);
  if (auth === "pass-missing")
    return json({ error: "pass-missing", message: "还没设置环境变量 SITE_PASS" }, 500);
  if (auth !== "ok") return json({ error: "unauthorized" }, 401);
  return null;
}

export async function onRequestGet(context) {
  const denied = guard(context);
  if (denied) return denied;
  const stored = await context.env.ROOM_KV.get(KEY, "json");
  if (!stored) return json({ rev: null, updatedAt: null, data: null });
  return json(stored);
}

export async function onRequestPost(context) {
  const denied = guard(context);
  if (denied) return denied;

  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: "bad-json" }, 400);
  }
  if (!body || typeof body !== "object" || !body.data || !Array.isArray(body.data.memories))
    return json({ error: "bad-data" }, 400);

  const current = await context.env.ROOM_KV.get(KEY, "json");
  const expected = body.rev || null;

  if (!body.force && current && current.rev !== expected) {
    return json(
      { error: "conflict", rev: current.rev, updatedAt: current.updatedAt, data: current.data },
      409
    );
  }

  const rev = crypto.randomUUID();
  const updatedAt = new Date().toISOString();
  const payload = JSON.stringify({ rev, updatedAt, data: body.data });

  if (payload.length > MAX_BYTES) return json({ error: "too-large", message: "内容太大了" }, 413);

  await context.env.ROOM_KV.put(KEY, payload);
  return json({ rev, updatedAt });
}
