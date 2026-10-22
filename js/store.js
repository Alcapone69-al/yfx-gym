// Camada de dados do YFX Gym (Supabase).
// Regra: tudo o que é crítico (check-in, treino/recordes, pesagem, ranking, convites) é uma função
// do servidor (RPC). O browser só lê o que as regras RLS deixam e cria texto/fotos/reações/comentários.
(function () {
  "use strict";

  const ERR = {
    AUTH: "A tua sessão terminou. Entra outra vez.",
    NO_GROUP: "Ainda não estás num grupo.",
    NO_GYM: "Ainda não guardaste o teu ginásio.",
    LOW_ACCURACY: "A localização está pouco precisa. Vai para perto de uma janela ou para a rua e tenta outra vez.",
    BAD_LOCATION: "Não consegui ler a tua localização. Tenta outra vez.",
    GYM_RECENT: "Só podes mudar de ginásio uma vez por semana.",
    BAD_WEIGHT: "Escreve um peso entre 30 e 300 kg.",
    BAD_SETS: "Há séries com valores inválidos. Revê as repetições e a carga.",
    BAD_NAME: "O nome tem de ter entre 2 e 40 letras.",
    BAD_COLOR: "Cor inválida.",
    BAD_GOAL: "Meta de peso inválida.",
    BAD_PATH: "Não foi possível guardar a foto.",
    INVALID_CODE: "Esse código de convite não existe. Confirma com quem te convidou.",
    ALREADY_IN_GROUP: "Já estás num grupo. Sai primeiro no teu perfil.",
    GROUP_FULL: "Este grupo já está cheio.",
    RATE_LIMIT: "Calma! Demasiadas tentativas seguidas. Espera uns minutos.",
    NOT_OWNER: "Só quem criou o grupo pode fazer isto.",
    NOT_ALLOWED: "Não tens permissão para isto.",
  };
  function friendly(err) {
    const m = String((err && (err.message || err.error_description || err.msg)) || err || "");
    const code = m.split(":")[0].trim();
    if (ERR[code]) return { code, message: ERR[code] };
    if (code === "TOO_FAR") return { code, message: "Estás longe do ginásio.", distance: parseInt(m.split(":")[1], 10) };
    if (/Invalid login/i.test(m)) return { code: "LOGIN", message: "Email ou palavra-passe errados." };
    if (/already registered|already been registered/i.test(m)) return { code: "EXISTS", message: "Este email já tem conta. Entra em vez de criar." };
    if (/Password should be|at least 6/i.test(m)) return { code: "WEAK", message: "A palavra-passe precisa de pelo menos 6 caracteres." };
    if (/Email not confirmed/i.test(m)) return { code: "UNCONFIRMED", message: "Confirma primeiro o teu email (vê a caixa de entrada e o spam)." };
    if (/rate limit|too many/i.test(m)) return { code: "RATE_LIMIT", message: ERR.RATE_LIMIT };
    if (/JWT|token|not authenticated/i.test(m)) return { code: "AUTH", message: ERR.AUTH };
    if (/row-level security|permission denied/i.test(m)) return { code: "NOT_ALLOWED", message: ERR.NOT_ALLOWED };
    if (/Failed to fetch|NetworkError|Load failed|network|fetch/i.test(m) || (typeof navigator !== "undefined" && !navigator.onLine))
      return { code: "OFFLINE", message: "Sem ligação à internet. Nada foi guardado; tenta outra vez quando tiveres rede." };
    return { code: "UNKNOWN", message: "Algo correu mal. Tenta outra vez." };
  }
  class AppError extends Error { constructor(f) { super(f.message); this.code = f.code; this.distance = f.distance; } }
  const fail = (e) => { throw new AppError(friendly(e)); };

  const PROFILE_COLS = "id,name,color,visits_target,weight_goal_kg,avatar_path,group_id";

  class Store {
    constructor(url, key) {
      this.sb = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      this.urlCache = new Map(); // caminho da foto -> {url, exp}
      this.onSignedOut = null;
      this.sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT" && this.onSignedOut) this.onSignedOut(); });
    }
    async q(p) { let r; try { r = await p; } catch (e) { fail(e); } if (r.error) fail(r.error); return r.data; }

    // ---------- sessão ----------
    async init() {
      const { data } = await this.sb.auth.getSession();
      this.uid = data.session?.user?.id || null;
      if (this.uid) await this.loadProfile();
      return !!this.uid;
    }
    async loadProfile() { this.profile = await this.q(this.sb.from("profiles").select(PROFILE_COLS).eq("id", this.uid).maybeSingle()); return this.profile; }
    async signUp(email, password, name) {
      const d = await this.q(this.sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + location.pathname } }));
      if (!d.session) return "confirm";
      this.uid = d.user.id; await this.loadProfile(); return "ok";
    }
    async signIn(email, password) { const d = await this.q(this.sb.auth.signInWithPassword({ email, password })); this.uid = d.user.id; await this.loadProfile(); }
    async signOut() { try { await this.sb.auth.signOut(); } catch (e) {} this.uid = null; this.profile = null; }
    get gid() { return this.profile?.group_id; }

    // ---------- grupo ----------
    async createGroup(name) { await this.q(this.sb.rpc("create_group", { p_name: name })); await this.loadProfile(); }
    async joinGroup(code) { await this.q(this.sb.rpc("join_group", { p_code: code })); await this.loadProfile(); }
    async leaveGroup() { await this.q(this.sb.rpc("leave_group")); await this.loadProfile(); }
    async rotateInvite() { return await this.q(this.sb.rpc("rotate_invite")); }
    async removeMember(uid) { await this.q(this.sb.rpc("remove_member", { p_user: uid })); }
    async getGroup() { return await this.q(this.sb.from("groups").select("id,name,invite_code,created_by,timezone").eq("id", this.gid).single()); }
    async members() { return await this.q(this.sb.from("profiles").select(PROFILE_COLS).eq("group_id", this.gid).order("name")); }
    async updateProfile(patch) {
      const allowed = {}; ["name", "color", "visits_target", "weight_goal_kg"].forEach((k) => { if (k in patch) allowed[k] = patch[k]; });
      await this.q(this.sb.from("profiles").update(allowed).eq("id", this.uid));
      await this.loadProfile();
    }
    async setAvatar(path) { await this.q(this.sb.rpc("set_avatar", { p_path: path })); await this.loadProfile(); }

    // ---------- semana / ranking ----------
    async ranking(weeksAgo = 0) { return await this.q(this.sb.rpc("week_ranking", { p_weeks_ago: weeksAgo })); }
    async myWeekTarget() { return await this.q(this.sb.rpc("my_week_target")); }
    async myCheckinDays(fromDate) { return (await this.q(this.sb.from("checkins").select("local_date,created_at").eq("user_id", this.uid).gte("local_date", fromDate))); }

    // ---------- check-in ----------
    async myGym() { return await this.q(this.sb.rpc("my_gym")); }
    async checkIn(pos) { return await this.q(this.sb.rpc("check_in", { p_lat: pos.latitude, p_lng: pos.longitude, p_accuracy: pos.accuracy })); }
    async setGymAndCheckIn(pos) { return await this.q(this.sb.rpc("set_gym_and_check_in", { p_lat: pos.latitude, p_lng: pos.longitude, p_accuracy: pos.accuracy })); }

    // ---------- peso ----------
    async myWeight() { return await this.q(this.sb.rpc("my_weight")); }
    async logWeight(kg) { return await this.q(this.sb.rpc("log_weight", { p_kg: kg })); }

    // ---------- treinos ----------
    async finishWorkout(clientId, title, sets) { return await this.q(this.sb.rpc("finish_workout", { p_client_id: clientId, p_title: title, p_sets: sets })); }
    async myWorkouts(limit = 10, before) {
      let q = this.sb.from("workouts").select("id,title,sets,volume,prs,created_at").eq("user_id", this.uid).order("created_at", { ascending: false }).limit(limit);
      if (before) q = q.lt("created_at", before);
      return await this.q(q);
    }
    async myBests(ex) { return await this.q(this.sb.rpc("my_bests", { p_ex: ex })); }
    async groupBests(ex) { return await this.q(this.sb.rpc("group_bests", { p_ex: ex })); }

    // ---------- feed ----------
    async posts(limit = 20, before) {
      let q = this.sb.from("posts").select("id,user_id,kind,body,meta,photo_path,created_at").eq("group_id", this.gid).order("created_at", { ascending: false }).limit(limit);
      if (before) q = q.lt("created_at", before);
      return await this.q(q);
    }
    async addPost(body, photoPath) {
      return await this.q(this.sb.from("posts").insert({ group_id: this.gid, user_id: this.uid, kind: photoPath ? "photo" : "text", body: body || "", photo_path: photoPath || null }).select("id").single());
    }
    async deletePost(id) { await this.q(this.sb.from("posts").delete().eq("id", id).eq("user_id", this.uid)); }
    async reactions(ids) { if (!ids.length) return []; return await this.q(this.sb.from("reactions").select("post_id,user_id,emoji").in("post_id", ids)); }
    async toggleReaction(postId, emoji, on) {
      if (on) {
        const r = await this.sb.from("reactions").insert({ post_id: postId, emoji, user_id: this.uid, group_id: this.gid });
        if (r.error && r.error.code !== "23505") fail(r.error); // 23505 = já existia: não é erro
      } else await this.q(this.sb.from("reactions").delete().match({ post_id: postId, emoji, user_id: this.uid }));
    }
    async comments(ids) { if (!ids.length) return []; return await this.q(this.sb.from("comments").select("id,post_id,user_id,body,created_at").in("post_id", ids).order("created_at")); }
    async addComment(postId, body) { await this.q(this.sb.from("comments").insert({ post_id: postId, body, user_id: this.uid, group_id: this.gid })); }
    async deleteComment(id) { await this.q(this.sb.from("comments").delete().eq("id", id).eq("user_id", this.uid)); }

    // ---------- fotos (bucket privado + links temporários) ----------
    async uploadPhoto(blob, kind = "post") {
      const rnd = Math.random().toString(36).slice(2, 8);
      const path = `${this.gid}/${this.uid}/${kind}-${Date.now()}-${rnd}.jpg`;
      await this.q(this.sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg", upsert: false }));
      return path;
    }
    async signedUrls(paths) {
      const now = Date.now(), need = [...new Set(paths.filter(Boolean))].filter((p) => !(this.urlCache.get(p)?.exp > now + 60e3));
      if (need.length) {
        try {
          const data = await this.q(this.sb.storage.from("photos").createSignedUrls(need, 3600));
          (data || []).forEach((d) => { if (d.signedUrl) this.urlCache.set(d.path, { url: d.signedUrl, exp: now + 3500e3 }); });
        } catch (e) { /* sem rede: mostra sem foto */ }
      }
      const out = {}; paths.forEach((p) => { if (p && this.urlCache.has(p)) out[p] = this.urlCache.get(p).url; }); return out;
    }

    // ---------- tempo real ----------
    subscribe(fn) {
      this.unsubscribe();
      let t; const ping = (table) => { clearTimeout(t); t = setTimeout(() => fn(table), 500); };
      this.ch = this.sb.channel("g-" + this.gid);
      ["posts", "reactions", "comments", "checkins"].forEach((table) =>
        this.ch.on("postgres_changes", { event: "*", schema: "public", table, filter: `group_id=eq.${this.gid}` }, () => ping(table)));
      this.ch.subscribe();
    }
    unsubscribe() { if (this.ch) { this.sb.removeChannel(this.ch); this.ch = null; } }
  }

  window.YFXStore = { Store, AppError, friendly };
})();
