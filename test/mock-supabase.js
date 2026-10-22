// Simulador mínimo do supabase-js, só para testes de interface (não vai para produção).
// Imita as respostas das funções do servidor (RPC) e as tabelas que a app lê.
(function () {
  const T = window.__MOCK || {};
  const today = T.today || "2026-10-22", ws = "2026-10-19";
  const uid = "u1", gid = "g1";
  const iso = (mAgo) => new Date(Date.now() - mAgo * 60000).toISOString();
  const longName = "Maximiliano Alexandre Cumbe";
  const db = {
    profiles: [
      { id: "u1", name: "Yassin", color: "#22d3ee", visits_target: 4, weight_goal_kg: -1, avatar_path: null, group_id: gid },
      { id: "u2", name: "Chico", color: "#34d399", visits_target: 5, weight_goal_kg: 0, avatar_path: null, group_id: gid },
      { id: "u3", name: longName, color: "#f472b6", visits_target: 3, weight_goal_kg: -0.5, avatar_path: null, group_id: gid },
      { id: "u4", name: "Dércio", color: "#fbbf24", visits_target: 4, weight_goal_kg: 0.25, avatar_path: null, group_id: gid },
    ],
    groups: [{ id: gid, name: "Os Monstros do Ferro", invite_code: "K7MP2QXA", created_by: "u1", timezone: "Africa/Maputo" }],
    checkins: [{ user_id: "u1", local_date: "2026-10-19", created_at: iso(3 * 1440) }, { user_id: "u1", local_date: "2026-10-20", created_at: iso(2 * 1440) }],
    workouts: [{ id: "w1", user_id: "u1", title: "Costas + Bíceps", sets: [{ ex: "Puxada frontal", reps: 10, kg: 55 }, { ex: "Puxada frontal", reps: 8, kg: 60 }], volume: 1030, prs: [], created_at: iso(3 * 1440) }],
    posts: [], reactions: [], comments: [],
  };
  const kinds = [["text", { }, "Quem vem treinar pernas amanhã às 6h? 🦵 Quem faltar paga o sumo. " + "Texto comprido ".repeat(T.longText ? 30 : 0)], ["workout", { title: "Peito", n_ex: 2, n_sets: 5, volume: 1767, prs: [{ ex: "Supino reto (barra)", kg: 90, reps: 3 }] }], ["checkin", {}], ["weighin", { delta: -0.8, goal: -1, result: "perto" }], ["goal", { visits: 5, target: 5 }], ["checkin", { moved: true }], ["photo", {}, "Pós-treino"]];
  const nPosts = T.manyPosts ? 45 : kinds.length;
  for (let i = 0; i < nPosts; i++) { const k = kinds[i % kinds.length]; db.posts.push({ id: "p" + i, user_id: ["u2", "u3", "u4", "u1"][i % 4], kind: k[0], body: k[2] || "", meta: k[1], photo_path: k[0] === "photo" ? "g1/u2/x.jpg" : null, created_at: iso(30 + i * 90), group_id: gid }); }
  db.reactions.push({ post_id: "p1", user_id: "u2", emoji: "🔥" }, { post_id: "p1", user_id: "u4", emoji: "🔥" });
  db.comments.push({ id: "c1", post_id: "p1", user_id: "u2", body: "Monstro! Para a semana são 95 🔥", created_at: iso(20) });
  let gym = T.noGym ? null : { saved: true, can_change_at: new Date(Date.now() + 3 * 864e5).toISOString() };
  let weights = T.noWeight ? [] : [{ local_date: "2026-10-12", kg: 97 }, { local_date: "2026-10-19", kg: 96.2 }];
  const calls = (window.__calls = []);
  const ok = (data) => Promise.resolve({ data, error: null });
  const err = (message, code) => Promise.resolve({ data: null, error: { message, code } });
  const delay = (v) => new Promise((r) => setTimeout(() => r(v), T.slow ? 1200 : 30));

  function myWeight() {
    const inWeek = weights.filter((w) => w.local_date >= ws), before = weights.filter((w) => w.local_date < ws);
    const start = (inWeek[0] || before[before.length - 1] || {}).kg ?? null, cur = (weights[weights.length - 1] || {}).kg ?? null;
    return { start, current: cur, goal: -1, target: start != null ? start - 1 : null, delta: start != null && cur != null ? +(cur - start).toFixed(1) : null, this_week: inWeek.length > 0, today, week_start: ws, weekday: T.weekday || 4 };
  }
  function ranking() {
    return db.profiles.map((p) => {
      const v = new Set(db.checkins.filter((c) => c.user_id === p.id && c.local_date >= ws).map((c) => c.local_date)).size + ({ u2: 4, u3: 2, u4: 0 }[p.id] || 0);
      const w = db.workouts.filter((x) => x.user_id === p.id);
      return { user_id: p.id, name: p.name, color: p.color, avatar_path: p.avatar_path, visits: v, target: p.visits_target, pct: Math.min(100, Math.floor((v * 100) / p.visits_target)), workouts: w.length, volume: w.reduce((s, x) => s + x.volume, 0), weight_delta: p.id === "u1" ? myWeight().delta : null, last_visit: { u1: "2026-10-20", u2: today, u3: "2026-10-21", u4: "2026-10-16" }[p.id], week_start: ws, today };
    }).sort((a, b) => b.pct - a.pct || b.visits - a.visits || b.volume - a.volume);
  }
  const rpc = {
    week_ranking: (a) => ranking().map((r) => a.p_weeks_ago ? { ...r, visits: 1, pct: 25, week_start: "2026-10-12" } : r),
    my_weight: () => myWeight(),
    my_gym: () => gym || { saved: false, can_change_at: null },
    my_week_target: () => ({ frozen: true, visits_target: 4, weight_goal_kg: -1 }),
    my_bests: () => [{ ex: "Supino reto (barra)", kg: 85, reps: 5 }],
    group_bests: () => [{ ex: "Supino reto (barra)", user_id: "u3", kg: 90, reps: 3 }, { ex: "Agachamento (barra)", user_id: "u2", kg: 115, reps: 5 }],
    check_in: (a) => {
      if (T.tooFar) return { __err: "TOO_FAR:2979" };
      if (db.checkins.some((c) => c.user_id === uid && c.local_date === today)) return { status: "already" };
      db.checkins.push({ user_id: uid, local_date: today, created_at: new Date().toISOString() });
      const v = ranking().find((r) => r.user_id === uid).visits;
      db.posts.unshift({ id: "pc" + Date.now(), user_id: uid, kind: "checkin", body: "", meta: {}, created_at: new Date().toISOString() });
      return { status: "ok", visits: v, target: 4, goal_reached: v === 4, first_of_week: v === 1 };
    },
    set_gym_and_check_in: (a) => { gym = { saved: true, can_change_at: new Date(Date.now() + 7 * 864e5).toISOString() }; T.tooFar = false; return rpc.check_in(a); },
    log_weight: (a) => { weights = weights.filter((w) => w.local_date !== today).concat([{ local_date: today, kg: Math.round(a.p_kg * 10) / 10 }]); return myWeight(); },
    finish_workout: (a) => {
      const prev = db.workouts.find((w) => w.client_id === a.p_client_id);
      if (prev) return { id: prev.id, volume: prev.volume, prs: prev.prs, duplicate: true, n_sets: prev.sets.length, n_ex: 1 };
      if (!Array.isArray(a.p_sets) || !a.p_sets.length || a.p_sets.some((s) => !(s.reps >= 1 && s.reps <= 1000) || !(s.kg >= 0 && s.kg <= 1000))) return { __err: "BAD_SETS" };
      const vol = a.p_sets.reduce((s, x) => s + x.kg * x.reps, 0);
      const prs = a.p_sets.filter((s) => s.ex === "Supino reto (barra)" && s.kg > 85).slice(0, 1).map((s) => ({ ex: s.ex, kg: s.kg, reps: s.reps }));
      const w = { id: "w" + Date.now(), client_id: a.p_client_id, user_id: uid, title: a.p_title, sets: a.p_sets, volume: vol, prs, created_at: new Date().toISOString() };
      db.workouts.unshift(w);
      db.posts.unshift({ id: "pw" + Date.now(), user_id: uid, kind: "workout", body: "", meta: { title: a.p_title, n_ex: new Set(a.p_sets.map((s) => s.ex)).size, n_sets: a.p_sets.length, volume: vol, prs }, created_at: new Date().toISOString() });
      return { id: w.id, volume: vol, prs, duplicate: false, n_sets: a.p_sets.length, n_ex: new Set(a.p_sets.map((s) => s.ex)).size };
    },
    set_avatar: (a) => { db.profiles[0].avatar_path = a.p_path; return null; },
    rotate_invite: () => { db.groups[0].invite_code = "NEWCODE2"; return "NEWCODE2"; },
    leave_group: () => { db.profiles[0].group_id = null; return null; },
    remove_member: (a) => { db.profiles = db.profiles.filter((p) => p.id !== a.p_user); return null; },
    create_group: () => { db.profiles[0].group_id = gid; return db.groups[0]; },
    join_group: (a) => (a.p_code.toUpperCase().replace(/\s/g, "") === "K7MP2QXA" ? (db.profiles[0].group_id = gid, db.groups[0]) : { __err: "INVALID_CODE" }),
  };
  function query(table) {
    let rows = () => (db[table] || []).slice(), filters = [], order = null, lim = null, op = "select", payload = null, single = false, maybe = false;
    const q = {
      select() { return q; }, eq(k, v) { filters.push((r) => r[k] === v); return q; }, gte(k, v) { filters.push((r) => r[k] >= v); return q; },
      lt(k, v) { filters.push((r) => r[k] < v); return q; }, in(k, vs) { filters.push((r) => vs.includes(r[k])); return q; },
      match(o) { Object.entries(o).forEach(([k, v]) => filters.push((r) => r[k] === v)); return q; },
      order(k, o = {}) { order = [k, o.ascending !== false]; return q; }, limit(n) { lim = n; return q; },
      single() { single = true; return q; }, maybeSingle() { maybe = true; return q; },
      insert(p) { op = "insert"; payload = p; return q; }, update(p) { op = "update"; payload = p; return q; }, delete() { op = "delete"; return q; },
      then(res, rej) {
        calls.push([table, op, payload]);
        if (T.offline) return delay({ data: null, error: { message: "Failed to fetch" } }).then(res, rej);
        let out;
        if (op === "insert") {
          if (table === "reactions" && db.reactions.some((r) => r.post_id === payload.post_id && r.user_id === payload.user_id && r.emoji === payload.emoji)) return delay({ data: null, error: { code: "23505", message: "duplicate" } }).then(res, rej);
          const row = { id: table[0] + Date.now() + Math.random(), created_at: new Date().toISOString(), meta: {}, ...payload };
          db[table].unshift(row); out = single ? { id: row.id } : [row];
        } else if (op === "update") { db[table].filter((r) => filters.every((f) => f(r))).forEach((r) => Object.assign(r, payload)); out = null; }
        else if (op === "delete") { db[table] = db[table].filter((r) => !filters.every((f) => f(r))); out = null; }
        else {
          let r = rows().filter((x) => filters.every((f) => f(x)));
          if (order) r.sort((a, b) => (a[order[0]] > b[order[0]] ? 1 : -1) * (order[1] ? 1 : -1));
          if (lim) r = r.slice(0, lim);
          out = single || maybe ? r[0] || null : r;
        }
        return delay({ data: out, error: null }).then(res, rej);
      },
    };
    return q;
  }
  const loggedIn = !T.loggedOut;
  window.supabase = {
    createClient() {
      return {
        auth: {
          getSession: () => ok({ session: loggedIn ? { user: { id: uid } } : null }),
          signInWithPassword: () => ok({ user: { id: uid }, session: {} }), signUp: () => ok({ user: { id: uid }, session: {} }),
          signOut: () => ok(null), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        },
        from: query,
        rpc(name, args) {
          calls.push(["rpc", name, args]);
          if (T.offline) return delay({ data: null, error: { message: "Failed to fetch" } });
          const r = rpc[name] ? rpc[name](args || {}) : null;
          if (r && r.__err) return delay({ data: null, error: { message: r.__err } });
          return delay({ data: r, error: null });
        },
        storage: { from: () => ({ upload: (p) => ok({ path: p }), createSignedUrls: (ps) => ok(ps.map((p) => ({ path: p, signedUrl: "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260"><rect width="400" height="260" fill="#1d4ed8"/><text x="200" y="140" font-size="28" fill="white" text-anchor="middle">foto</text></svg>') }))) }) },
        channel() { const c = { on() { return c; }, subscribe() { return c; } }; return c; },
        removeChannel() {},
      };
    },
  };
})();
