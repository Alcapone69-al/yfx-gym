// Camada de dados. Dois modos com a mesma interface:
//  - DemoStore: dados de exemplo guardados só neste telemóvel (localStorage)
//  - SupaStore: Supabase (contas, grupo privado, dados partilhados entre amigos)
(function () {
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "id" + Math.random().toString(36).slice(2) + Date.now());
  const iso = (d) => new Date(d).toISOString();

  // ---------------- DEMO ----------------
  const KEY = "yfxgym-demo-v1";
  function weekStartOf(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function at(base, dayOffset, h, m) { const x = new Date(base); x.setDate(x.getDate() + dayOffset); x.setHours(h, m || 0, 0, 0); return x; }

  function seed() {
    const now = new Date(), ws = weekStartOf(now), di = (now.getDay() + 6) % 7;
    const G = { id: "g1", name: "Os Monstros do Ferro", invite_code: "YFX258", created_by: "u1" };
    const P = [
      { id: "u1", name: "Yassin", color: "#22d3ee", visits_target: 4, weight_goal_kg: -1, gym_lat: null, gym_lng: null, group_id: "g1" },
      { id: "u2", name: "Chico", color: "#34d399", visits_target: 5, weight_goal_kg: 0, group_id: "g1" },
      { id: "u3", name: "Nelson", color: "#f472b6", visits_target: 3, weight_goal_kg: -0.5, group_id: "g1" },
      { id: "u4", name: "Dércio", color: "#fbbf24", visits_target: 4, weight_goal_kg: 0.25, group_id: "g1" },
    ];
    const D = { me: "u1", group: G, profiles: P, checkins: [], workouts: [], weighins: [], posts: [], reactions: [], comments: [] };
    const ck = (u, t) => { D.checkins.push({ id: uuid(), user_id: u, group_id: "g1", verified: true, distance_m: 40, created_at: iso(t) }); D.posts.push({ id: uuid(), group_id: "g1", user_id: u, kind: "checkin", body: "", meta: { verified: true }, created_at: iso(t) }); };
    const wk = (u, t, title, sets, prs = []) => {
      const volume = sets.reduce((s, x) => s + (x.kg || 0) * (x.reps || 0), 0);
      const w = { id: uuid(), user_id: u, group_id: "g1", title, sets, volume, prs, created_at: iso(t) };
      D.workouts.push(w);
      D.posts.push({ id: uuid(), group_id: "g1", user_id: u, kind: "workout", body: "", meta: { workout_id: w.id, title, n_ex: new Set(sets.map((s) => s.ex)).size, n_sets: sets.length, volume, prs }, created_at: iso(new Date(t.getTime() + 75 * 60000)) });
    };
    const S = (ex, arr) => arr.map(([reps, kg]) => ({ ex, reps, kg }));
    // Semana passada (para histórico e "dias sem aparecer")
    [[-7, 6], [-5, 6], [-3, 18], [-4, 17]].forEach(([d, h], i) => ck(["u2", "u3", "u4", "u4"][i], at(ws, d, h)));
    wk("u4", at(ws, -4, 17), "Peito + Tríceps", [...S("Supino reto (barra)", [[8, 70], [8, 75], [6, 80]]), ...S("Tríceps na polia", [[12, 30], [12, 30]])]);
    // Esta semana
    [0, 1, 2, 3, 4, 5].filter((d) => d <= di).forEach((d) => ck("u2", at(ws, d, 6, 10)));
    [0, 2].filter((d) => d <= di).forEach((d) => ck("u3", at(ws, d, 18, 30)));
    [0, 1].filter((d) => d < di).forEach((d) => ck("u1", at(ws, d, 7, 5)));
    wk("u2", at(ws, 0, 6, 10), "Pernas", [...S("Agachamento (barra)", [[8, 100], [6, 110], [5, 115]]), ...S("Leg press", [[12, 200], [12, 220]])]);
    if (di >= 2) wk("u3", at(ws, 2, 18, 30), "Peito", [...S("Supino reto (barra)", [[8, 80], [5, 85], [3, 90]]), ...S("Crucifixo com halteres", [[12, 18], [12, 18]])], [{ ex: "Supino reto (barra)", kg: 90, reps: 3 }]);
    wk("u1", at(ws, 0, 7, 5), "Costas + Bíceps", [...S("Puxada frontal", [[10, 55], [10, 60], [8, 65]]), ...S("Remada baixa (cabo)", [[12, 50], [10, 55]]), ...S("Rosca direta (barra)", [[10, 30], [8, 32.5]])]);
    // Pesagens
    D.weighins.push({ id: uuid(), user_id: "u1", group_id: "g1", kg: 97.0, created_at: iso(at(ws, -7, 7)) });
    D.weighins.push({ id: uuid(), user_id: "u1", group_id: "g1", kg: 96.2, created_at: iso(at(ws, 0, 6, 50)) });
    D.weighins.push({ id: uuid(), user_id: "u3", group_id: "g1", kg: 84.0, created_at: iso(at(ws, -7, 8)) });
    D.weighins.push({ id: uuid(), user_id: "u3", group_id: "g1", kg: 83.6, created_at: iso(at(ws, 0, 8)) });
    D.posts.push({ id: uuid(), group_id: "g1", user_id: "u1", kind: "weighin", body: "", meta: { delta: -0.8, goal: -1, result: "perto" }, created_at: iso(at(ws, 0, 6, 51)) });
    const txt = { id: uuid(), group_id: "g1", user_id: "u2", kind: "text", body: "Quem vem treinar pernas amanhã às 6h? 🦵 Quem faltar paga o sumo.", meta: {}, created_at: iso(new Date(now.getTime() - 3 * 3600e3)) };
    D.posts.push(txt);
    D.posts.sort((a, b) => b.created_at.localeCompare(a.created_at));
    const pr = D.posts.find((p) => p.kind === "workout" && p.meta.prs && p.meta.prs.length);
    if (pr) { ["u1", "u2", "u4"].forEach((u) => D.reactions.push({ post_id: pr.id, user_id: u, emoji: "🔥", group_id: "g1" })); D.reactions.push({ post_id: pr.id, user_id: "u2", emoji: "💪", group_id: "g1" }); D.comments.push({ id: uuid(), post_id: pr.id, group_id: "g1", user_id: "u2", body: "Monstro! Para a semana são 95 🔥", created_at: iso(new Date(pr.created_at).getTime() + 20 * 60000) }); }
    D.reactions.push({ post_id: txt.id, user_id: "u3", emoji: "💪", group_id: "g1" });
    D.reactions.push({ post_id: txt.id, user_id: "u4", emoji: "😂", group_id: "g1" });
    D.comments.push({ id: uuid(), post_id: txt.id, group_id: "g1", user_id: "u3", body: "Conta comigo.", created_at: iso(new Date(now.getTime() - 2.5 * 3600e3)) });
    return D;
  }

  class DemoStore {
    constructor() { this.mode = "demo"; this.listeners = []; }
    _load() { try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r); } catch (e) {} const d = seed(); this._save(d); return d; }
    _save(d) { this.d = d; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* quota ou bloqueado: fica em memória */ } }
    _commit() { this._save(this.d); this.listeners.forEach((f) => f()); }
    async init() { this.d = this._load(); this.uid = this.d.me; return true; }
    reset() { try { localStorage.removeItem(KEY); } catch (e) {} this.d = seed(); this._save(this.d); }
    get profile() { return this.d.profiles.find((p) => p.id === this.uid); }
    async signOut() { this.reset(); }
    async getGroup() { return this.d.group; }
    async members() { return this.d.profiles.filter((p) => p.group_id === this.d.group.id); }
    async updateProfile(patch) { Object.assign(this.profile, patch); this._commit(); }
    async checkins(since) { return this.d.checkins.filter((c) => !since || c.created_at >= since); }
    async addCheckin(c) { const row = { id: uuid(), user_id: this.uid, group_id: "g1", created_at: iso(Date.now()), ...c }; this.d.checkins.push(row); this._commit(); return row; }
    async workouts({ userId, since, limit } = {}) { let w = this.d.workouts.filter((x) => (!userId || x.user_id === userId) && (!since || x.created_at >= since)); w.sort((a, b) => b.created_at.localeCompare(a.created_at)); return limit ? w.slice(0, limit) : w; }
    async addWorkout(w) { const row = { id: uuid(), user_id: this.uid, group_id: "g1", created_at: iso(Date.now()), ...w }; this.d.workouts.push(row); this._commit(); return row; }
    async weighins() { return [...this.d.weighins].sort((a, b) => a.created_at.localeCompare(b.created_at)); }
    async addWeighin(kg) { const row = { id: uuid(), user_id: this.uid, group_id: "g1", kg, created_at: iso(Date.now()) }; this.d.weighins.push(row); this._commit(); return row; }
    async posts(limit = 60) { return [...this.d.posts].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit); }
    async addPost(p) { const row = { id: uuid(), group_id: "g1", user_id: this.uid, meta: {}, body: "", created_at: iso(Date.now()), ...p }; this.d.posts.unshift(row); this._commit(); return row; }
    async uploadPhoto(blob) { return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); }
    async reactions(ids) { return this.d.reactions.filter((r) => ids.includes(r.post_id)); }
    async toggleReaction(postId, emoji, on) {
      this.d.reactions = this.d.reactions.filter((r) => !(r.post_id === postId && r.user_id === this.uid && r.emoji === emoji));
      if (on) this.d.reactions.push({ post_id: postId, user_id: this.uid, emoji, group_id: "g1" });
      this._commit();
    }
    async comments(ids) { return this.d.comments.filter((c) => ids.includes(c.post_id)).sort((a, b) => a.created_at.localeCompare(b.created_at)); }
    async addComment(postId, body) { this.d.comments.push({ id: uuid(), post_id: postId, group_id: "g1", user_id: this.uid, body, created_at: iso(Date.now()) }); this._commit(); }
    subscribe() { /* demo: sem tempo real, a app recarrega após cada ação */ }
  }

  // ---------------- SUPABASE ----------------
  class SupaStore {
    constructor(url, key) { this.mode = "live"; this.sb = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }); this.listeners = []; }
    _e(r) { if (r.error) throw new Error(friendly(r.error.message)); return r.data; }
    async init() {
      const { data: { session } } = await this.sb.auth.getSession();
      this.uid = session?.user?.id || null;
      if (this.uid) await this.loadProfile();
      return !!this.uid;
    }
    async loadProfile() { this._profile = this._e(await this.sb.from("profiles").select("*").eq("id", this.uid).maybeSingle()); return this._profile; }
    get profile() { return this._profile; }
    async signUp(email, password, name) {
      const r = await this.sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + location.pathname } });
      const d = this._e(r);
      if (!d.session) return "confirm";
      this.uid = d.user.id; await this.loadProfile(); return "ok";
    }
    async signIn(email, password) { const d = this._e(await this.sb.auth.signInWithPassword({ email, password })); this.uid = d.user.id; await this.loadProfile(); }
    async signOut() { await this.sb.auth.signOut(); this.uid = null; this._profile = null; }
    get gid() { return this._profile?.group_id; }
    async createGroup(name) { this._e(await this.sb.rpc("create_group", { p_name: name })); await this.loadProfile(); }
    async joinGroup(code) { this._e(await this.sb.rpc("join_group", { p_code: code })); await this.loadProfile(); }
    async getGroup() { return this._e(await this.sb.from("groups").select("*").eq("id", this.gid).single()); }
    async members() { return this._e(await this.sb.from("profiles").select("*").eq("group_id", this.gid)); }
    async updateProfile(patch) { this._e(await this.sb.from("profiles").update(patch).eq("id", this.uid)); Object.assign(this._profile, patch); }
    async checkins(since) { let q = this.sb.from("checkins").select("*").eq("group_id", this.gid); if (since) q = q.gte("created_at", since); return this._e(await q); }
    async addCheckin(c) { return this._e(await this.sb.from("checkins").insert({ ...c, user_id: this.uid, group_id: this.gid }).select().single()); }
    async workouts({ userId, since, limit } = {}) {
      let q = this.sb.from("workouts").select("*").eq("group_id", this.gid).order("created_at", { ascending: false });
      if (userId) q = q.eq("user_id", userId); if (since) q = q.gte("created_at", since); if (limit) q = q.limit(limit);
      return this._e(await q);
    }
    async addWorkout(w) { return this._e(await this.sb.from("workouts").insert({ ...w, user_id: this.uid, group_id: this.gid }).select().single()); }
    async weighins() { return this._e(await this.sb.from("weighins").select("*").eq("group_id", this.gid).order("created_at")); }
    async addWeighin(kg) { return this._e(await this.sb.from("weighins").insert({ kg, user_id: this.uid, group_id: this.gid }).select().single()); }
    async posts(limit = 60) { return this._e(await this.sb.from("posts").select("*").eq("group_id", this.gid).order("created_at", { ascending: false }).limit(limit)); }
    async addPost(p) { return this._e(await this.sb.from("posts").insert({ meta: {}, body: "", ...p, user_id: this.uid, group_id: this.gid }).select().single()); }
    async uploadPhoto(blob) {
      const path = `${this.gid}/${this.uid}/${Date.now()}.jpg`;
      this._e(await this.sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg" }));
      return this.sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
    }
    async reactions(ids) { if (!ids.length) return []; return this._e(await this.sb.from("reactions").select("*").in("post_id", ids)); }
    async toggleReaction(postId, emoji, on) {
      if (on) this._e(await this.sb.from("reactions").insert({ post_id: postId, emoji, user_id: this.uid, group_id: this.gid }));
      else this._e(await this.sb.from("reactions").delete().match({ post_id: postId, emoji, user_id: this.uid }));
    }
    async comments(ids) { if (!ids.length) return []; return this._e(await this.sb.from("comments").select("*").in("post_id", ids).order("created_at")); }
    async addComment(postId, body) { this._e(await this.sb.from("comments").insert({ post_id: postId, body, user_id: this.uid, group_id: this.gid })); }
    subscribe(fn) {
      if (this.ch) this.sb.removeChannel(this.ch);
      let t; const ping = () => { clearTimeout(t); t = setTimeout(fn, 400); };
      this.ch = this.sb.channel("g-" + this.gid);
      ["posts", "reactions", "comments", "checkins"].forEach((table) => this.ch.on("postgres_changes", { event: "*", schema: "public", table, filter: `group_id=eq.${this.gid}` }, ping));
      this.ch.subscribe();
    }
  }

  function friendly(m) {
    if (/Invalid login/i.test(m)) return "Email ou palavra-passe errados.";
    if (/already registered/i.test(m)) return "Este email já tem conta. Entra em vez de criar.";
    if (/Password should be/i.test(m)) return "A palavra-passe precisa de pelo menos 6 caracteres.";
    if (/Email not confirmed/i.test(m)) return "Confirma primeiro o teu email (vê a caixa de entrada).";
    if (/Código inválido/i.test(m)) return "Esse código de convite não existe. Confirma com quem te convidou.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Sem ligação à internet. Tenta outra vez.";
    return m;
  }

  window.makeStore = function () {
    const c = window.YFX_CONFIG || {};
    if (c.supabaseUrl && c.supabaseAnonKey && window.supabase) return new SupaStore(c.supabaseUrl, c.supabaseAnonKey);
    return new DemoStore();
  };
})();
