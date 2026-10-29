/* 云端同步（Cloudflare Pages Functions + KV）。
   没部署后端时（例如直接双击打开 index.html）自动退回纯本地模式。 */
window.RoomAPI = (function () {
  "use strict";
  const PASS_KEY = "our-room:pass";
  let pass = "";
  try {
    pass = localStorage.getItem(PASS_KEY) || "";
  } catch (e) {
    pass = "";
  }

  const isFile = () => location.protocol === "file:";

  async function call(method, body) {
    const headers = { "x-room-pass": pass };
    const opts = { method, headers, cache: "no-store" };
    if (body) {
      headers["content-type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch("api/state", opts);
  }

  async function readJSON(res) {
    try {
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  return {
    hasPass() {
      return !!pass;
    },
    setPass(p) {
      pass = p || "";
      try {
        if (pass) localStorage.setItem(PASS_KEY, pass);
        else localStorage.removeItem(PASS_KEY);
      } catch (e) {}
    },

    /** 读取云端状态：offline / locked / online / error */
    async load() {
      if (isFile()) return { mode: "offline" };
      let res;
      try {
        res = await call("GET");
      } catch (e) {
        return { mode: "offline" };
      }
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("application/json")) return { mode: "offline" }; // 纯静态托管，没有后端
      if (res.status === 401) return { mode: "locked" };
      if (res.status === 500) {
        const j = await readJSON(res);
        if (j && (j.error === "kv-missing" || j.error === "pass-missing"))
          return { mode: "error", message: j.message || "服务端未配置好" };
        return { mode: "error", message: "服务端出错了" };
      }
      if (!res.ok) return { mode: "error", message: "读取失败（" + res.status + "）" };
      const j = await readJSON(res);
      if (!j) return { mode: "error", message: "返回内容无法解析" };
      return { mode: "online", rev: j.rev, updatedAt: j.updatedAt, data: j.data };
    },

    /** 保存：ok / conflict / locked / error */
    async save(data, rev, force) {
      let res;
      try {
        res = await call("POST", { rev: rev || null, data, force: !!force });
      } catch (e) {
        return { ok: false, message: "网络不通" };
      }
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("application/json")) return { ok: false, message: "没有后端（静态托管）" };
      if (res.status === 409) {
        const j = await readJSON(res);
        return { ok: false, conflict: true, rev: j && j.rev, data: j && j.data };
      }
      if (res.status === 401) return { ok: false, locked: true };
      if (res.status === 413) return { ok: false, message: "内容太大，先删掉几张照片" };
      if (!res.ok) {
        const j = await readJSON(res);
        return { ok: false, message: (j && j.message) || "保存失败（" + res.status + "）" };
      }
      const j = await readJSON(res);
      return { ok: true, rev: j && j.rev, updatedAt: j && j.updatedAt };
    }
  };
})();
