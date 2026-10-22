/* YFX Gym — V1. Vanilla JS, sem build. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const kg = (n, d = 1) => Number(n).toLocaleString("pt-PT", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + kg(Math.abs(n));
  const DAY = 86400e3;
  const weekStart = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const dayIdx = (d = new Date()) => (new Date(d).getDay() + 6) % 7;
  const dayKey = (d) => { const x = new Date(d); return x.getFullYear() + "-" + (x.getMonth() + 1) + "-" + x.getDate(); };
  const DIAS = ["S", "T", "Q", "Q", "S", "S", "D"];
  const EMOJIS = ["🔥", "💪", "👏", "😂", "👀"];

  const S = { view: "inicio", members: [], byId: {}, checkins: [], weighins: [], weekWorkouts: [], allWorkouts: [], group: null };
  let store;

  // ---------- util UI ----------
  function toast(msg, kind = "") {
    const t = document.createElement("div");
    t.className = "toast " + kind; t.textContent = msg; t.setAttribute("role", "status");
    $("#toasts").appendChild(t);
    setTimeout(() => t.classList.add("out"), 2800); setTimeout(() => t.remove(), 3300);
  }
  function sheet(html, onMount) {
    closeSheet();
    const w = document.createElement("div");
    w.className = "sheet-wrap"; w.innerHTML = `<div class="sheet-bg" data-close></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grab"></div>${html}</div>`;
    document.body.appendChild(w);
    requestAnimationFrame(() => w.classList.add("open"));
    w.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
    onMount && onMount(w);
    return w;
  }
  function closeSheet() { $$(".sheet-wrap").forEach((w) => { w.classList.remove("open"); setTimeout(() => w.remove(), 250); }); }
  function avatar(p, size = 40) {
    const name = p?.name || "?";
    const ini = name.trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
    return `<span class="av" style="--c:${esc(p?.color || "#22d3ee")};--s:${size}px" aria-hidden="true">${esc(ini)}</span>`;
  }
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return "agora"; if (s < 3600) return `há ${Math.floor(s / 60)} min`; if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
    const d = Math.floor(s / 86400); if (d === 1) return "ontem"; if (d < 7) return `há ${d} dias`;
    return new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
  }
  const hhmm = (iso) => new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  const busy = (btn, on, label) => { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.l = btn.innerHTML; btn.innerHTML = label || "Aguarda…"; } else if (btn.dataset.l) btn.innerHTML = btn.dataset.l; };

  // ---------- cálculos ----------
  const me = () => store.profile;
  function visitDays(uid, from, to) { const set = new Set(); S.checkins.forEach((c) => { const t = new Date(c.created_at); if (c.user_id === uid && t >= from && t < to) set.add(dayKey(t)); }); return set; }
  function weekStats(uid) {
    const ws = weekStart(), we = new Date(ws.getTime() + 7 * DAY);
    const p = S.byId[uid] || {}; const days = visitDays(uid, ws, we);
    const visits = days.size, target = p.visits_target || 4;
    const wk = S.weekWorkouts.filter((w) => w.user_id === uid);
    return { visits, target, pct: Math.min(100, Math.round((visits / target) * 100)), rawPct: Math.round((visits / target) * 100), workouts: wk.length, volume: wk.reduce((s, w) => s + Number(w.volume || 0), 0), days, weight: weightInfo(uid) };
  }
  function lastVisit(uid) { let last = null; S.checkins.forEach((c) => { if (c.user_id === uid && (!last || c.created_at > last)) last = c.created_at; }); return last; }
  function weekStartWeight(list, ws) {
    const we = new Date(ws.getTime() + 7 * DAY);
    const inWeek = list.find((w) => new Date(w.created_at) >= ws && new Date(w.created_at) < we);
    if (inWeek) return inWeek;
    const before = list.filter((w) => new Date(w.created_at) < ws); return before[before.length - 1] || null;
  }
  function weightInfo(uid) {
    const list = S.weighins.filter((w) => w.user_id === uid);
    if (!list.length) return null;
    const ws = weekStart(); const start = weekStartWeight(list, ws); const cur = list[list.length - 1];
    const goal = Number(S.byId[uid]?.weight_goal_kg || 0);
    const thisWeek = list.some((w) => new Date(w.created_at) >= ws);
    return { start: start ? Number(start.kg) : null, current: Number(cur.kg), goal, target: start ? Number(start.kg) + goal : null, delta: start ? Number(cur.kg) - Number(start.kg) : 0, thisWeek, last: cur };
  }
  function weighResult(delta, goal) {
    if (goal === 0) return Math.abs(delta) <= 0.5 ? "cumpriu" : "falhou";
    const r = delta / goal; // fração da meta atingida
    return r >= 1 ? "cumpriu" : r >= 0.6 ? "perto" : "falhou";
  }
  function ranking() {
    return S.members.map((m) => ({ m, ...weekStats(m.id) }))
      .sort((a, b) => b.pct - a.pct || b.visits - a.visits || b.volume - a.volume || a.m.name.localeCompare(b.m.name));
  }
  const goalLabel = (g) => (g < 0 ? `perder ${kg(-g, 2)} kg/semana` : g > 0 ? `ganhar ${kg(g, 2)} kg/semana` : "manter o peso");

  // ---------- Yofi, a vigia ----------
  function vigia() {
    const p = me(), st = weekStats(p.id), di = dayIdx(), daysLeft = 7 - di;
    const todayDone = st.days.has(dayKey(new Date()));
    const lines = []; let pose = "normal";
    const w = st.weight;
    if (p.weight_goal_kg !== null && (!w || !w.thisWeek)) { pose = "alerta"; lines.push(`Nova semana, nova pesagem. Sobe à balança e regista o teu peso para eu ver se a meta de ${goalLabel(Number(p.weight_goal_kg))} vai bem.`); }
    else if (st.visits >= st.target) { pose = "celebra"; lines.push(`Meta da semana cumprida: ${st.visits}/${st.target} idas. Daqui para a frente é bónus.`); }
    else if (!todayDone) {
      const falta = st.target - st.visits;
      if (falta > daysLeft) { pose = "alerta"; lines.push(`Faltam ${falta} idas e só restam ${daysLeft} dias. Esta semana já não fecha a 100%, mas cada ida ainda sobe a tua %.`); }
      else { pose = "alerta"; lines.push(`Ainda não fizeste check-in hoje. Faltam ${falta} ${falta === 1 ? "ida" : "idas"} para a meta e restam ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}.`); }
    } else { pose = "ola"; lines.push(`Check-in feito hoje. Já vais em ${st.visits}/${st.target} esta semana.`); }
    // vigiar os amigos
    const lazy = S.members.filter((m) => m.id !== p.id).map((m) => { const lv = lastVisit(m.id); return { m, d: lv ? Math.floor((Date.now() - new Date(lv)) / DAY) : 99 }; }).filter((x) => x.d >= 3).sort((a, b) => b.d - a.d)[0];
    if (lazy) lines.push(lazy.d >= 99 ? `O ${lazy.m.name} ainda não fez nenhum check-in. Estou de olho 👀` : `O ${lazy.m.name} não aparece no ginásio há ${lazy.d} dias. Estou de olho 👀`);
    else { const r = ranking(); if (r[0] && r[0].m.id !== p.id && r[0].pct > 0) lines.push(`O ${r[0].m.name} lidera a semana com ${r[0].pct}% da meta.`); }
    return { pose, lines };
  }

  // ---------- dados ----------
  async function loadCore() {
    const since = new Date(Date.now() - 35 * DAY).toISOString();
    const ws = weekStart().toISOString();
    const [members, group, checkins, weighins, allW] = await Promise.all([store.members(), store.getGroup(), store.checkins(since), store.weighins(), store.workouts({})]);
    S.members = members; S.byId = Object.fromEntries(members.map((m) => [m.id, m])); S.group = group;
    S.checkins = checkins; S.weighins = weighins; S.allWorkouts = allW; S.weekWorkouts = allW.filter((w) => w.created_at >= ws);
  }

  // ---------- shell ----------
  const ICON = {
    inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    feed: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    treino: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
    ranking: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
    perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  };
  const TABS = [["inicio", "Início"], ["feed", "Feed"], ["treino", "Treino"], ["ranking", "Ranking"], ["perfil", "Perfil"]];
  const ico = (k) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

  function buildShell() {
    $("#app").innerHTML = `
      <header class="top">
        <div class="brand">${ymark(26)}<span class="wordmark">YFX <b>GYM</b></span></div>
        <div class="grp" id="grpName"></div>
      </header>
      ${store.mode === "demo" ? `<div class="demo-bar">Modo demonstração · dados de exemplo só neste telemóvel</div>` : ""}
      <main id="view" tabindex="-1"></main>
      <footer class="powered">powered by <b>YFX</b></footer>
      <nav class="tabs" aria-label="Navegação">${TABS.map(([k, l]) => `<button class="tab" data-tab="${k}" aria-label="${l}">${ico(k)}<span>${l}</span></button>`).join("")}</nav>`;
    $$(".tab").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));
  }
  function ymark(s) {
    return `<svg viewBox="0 0 64 64" width="${s}" height="${s}" aria-hidden="true"><defs><linearGradient id="ma" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F4FB0"/><stop offset="1" stop-color="#3B82F6"/></linearGradient><linearGradient id="mb" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0891B2"/><stop offset="1" stop-color="#22D3EE"/></linearGradient><linearGradient id="mc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1D4ED8"/><stop offset="1" stop-color="#06B6D4"/></linearGradient></defs><polygon points="4,6 30,6 32,30 20,34" fill="url(#ma)"/><polygon points="34,6 60,6 44,34 32,30" fill="url(#mb)"/><polygon points="20,34 32,30 44,34 38,58 26,58" fill="url(#mc)"/><polygon points="30,6 34,6 32,30" fill="#243E94"/></svg>`;
  }
  function go(view) { S.view = view; window.scrollTo(0, 0); render(); }
  async function refresh() { try { await loadCore(); } catch (e) { toast(e.message, "bad"); } render(); }
  function render() {
    $$(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.view));
    const g = $("#grpName"); if (g && S.group) g.textContent = S.group.name;
    ({ inicio: vInicio, feed: vFeed, treino: vTreino, ranking: vRanking, perfil: vPerfil })[S.view]();
  }

  // ---------- INÍCIO ----------
  function vInicio() {
    const p = me(), st = weekStats(p.id), v = vigia(), di = dayIdx();
    const today = S.checkins.filter((c) => c.user_id === p.id && dayKey(c.created_at) === dayKey(new Date()))[0];
    const ws = weekStart(); const w = st.weight;
    const R = 46, C = 2 * Math.PI * R, frac = Math.min(1, st.visits / st.target);
    $("#view").innerHTML = `
      <section class="vigia card">
        <div class="vigia-owl">${yofi(v.pose, 92)}</div>
        <div class="bubble"><span class="eyebrow">Yofi está a vigiar</span>${v.lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>
      </section>

      <section class="card checkin">
        ${today ? `<div class="ck-done"><span class="ck-ok">✓</span><div><b>Check-in feito às ${hhmm(today.created_at)}</b><small>${today.verified ? "Localização confirmada no teu ginásio" : "Sem confirmação de GPS"}</small></div></div>`
        : `<button class="btn primary big" id="btnCheckin">${ico("inicio")}<span>Cheguei ao ginásio · Check-in</span></button>
           <small class="hint">${p.gym_lat ? "Confirmamos pela localização que estás no teu ginásio." : "No primeiro check-in guardamos a localização do teu ginásio."}</small>`}
      </section>

      <section class="card goal">
        <div class="ring">
          <svg viewBox="0 0 110 110" width="110" height="110" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
            <circle cx="55" cy="55" r="${R}" class="ring-bg"/><circle cx="55" cy="55" r="${R}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}" transform="rotate(-90 55 55)"/></svg>
          <div class="ring-txt"><b>${st.visits}<span>/${st.target}</span></b><small>idas</small></div>
        </div>
        <div class="goal-side">
          <span class="eyebrow">Meta da semana</span>
          <h2>${st.rawPct}% cumprido</h2>
          <div class="days" aria-label="Dias com check-in esta semana">${DIAS.map((d, i) => { const k = dayKey(new Date(ws.getTime() + i * DAY)); return `<span class="d ${st.days.has(k) ? "on" : ""} ${i === di ? "today" : ""}">${d}</span>`; }).join("")}</div>
          <small class="muted">${st.workouts} ${st.workouts === 1 ? "treino registado" : "treinos registados"} · ${kg(st.volume, 0)} kg de volume</small>
        </div>
      </section>

      <section class="card weight">
        <div class="row-between"><span class="eyebrow">Peso · ${esc(goalLabel(Number(p.weight_goal_kg || 0)))}</span>${w && w.thisWeek ? `<span class="pill ${w.delta === 0 ? "" : weighResult(w.delta, w.goal)}">${w.delta === 0 ? "início da semana" : signed(w.delta) + " kg"}</span>` : ""}</div>
        ${w ? `<div class="wgrid">
            <div><small>Início da semana</small><b>${w.start !== null ? kg(w.start) : "—"}<i>kg</i></b></div>
            <div><small>Meta</small><b class="grad">${w.target !== null ? kg(w.target) : "—"}<i>kg</i></b></div>
            <div><small>Atual</small><b>${kg(w.current)}<i>kg</i></b></div></div>`
        : `<p class="muted">Ainda não tens pesagens. Regista o teu peso de hoje para começar a semana.</p>`}
        <form class="wform" id="wForm"><label for="wIn" class="sr">Peso de hoje em kg</label>
          <input id="wIn" inputmode="decimal" placeholder="Peso de hoje (kg)" autocomplete="off">
          <button class="btn" type="submit">Registar pesagem</button></form>
        <small class="muted">O grupo vê só a variação da semana, nunca o teu peso exato.</small>
      </section>

      <button class="btn ghost wide" id="goTreino">${ico("treino")}<span>Registar o treino de hoje</span></button>`;
    $("#btnCheckin")?.addEventListener("click", doCheckin);
    $("#goTreino").addEventListener("click", () => go("treino"));
    $("#wForm").addEventListener("submit", doWeighin);
  }

  function haversine(a, b, c, d) { const R = 6371e3, t = Math.PI / 180, x = Math.sin(((c - a) * t) / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(((d - b) * t) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
  function getPos() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error("Este telemóvel não dá a localização ao browser."));
      navigator.geolocation.getCurrentPosition((p) => res(p.coords), (e) => rej(new Error(e.code === 1 ? "Não deste permissão de localização." : "Não consegui obter a localização. Vai para perto de uma janela e tenta outra vez.")), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    });
  }
  async function doCheckin() {
    const btn = $("#btnCheckin"); busy(btn, true, "A confirmar localização…");
    const p = me();
    try {
      const pos = await getPos();
      if (!p.gym_lat) {
        busy(btn, false);
        sheet(`<div class="sheet-owl">${yofi("ola", 72)}</div><h3>Este é o teu ginásio?</h3><p class="muted">Vou guardar esta localização como o teu ginásio. Nos próximos check-ins confirmo que estás mesmo lá.</p>
          <div class="stack"><button class="btn primary" id="sYes">Sim, guardar e fazer check-in</button><button class="btn ghost" data-close>Ainda não cheguei</button></div>`, (w) => {
          $("#sYes", w).addEventListener("click", async (e) => { busy(e.currentTarget, true); try { await store.updateProfile({ gym_lat: pos.latitude, gym_lng: pos.longitude }); await saveCheckin(true, 0); closeSheet(); } catch (er) { toast(er.message, "bad"); busy(e.currentTarget, false); } });
        });
        return;
      }
      const dist = Math.round(haversine(p.gym_lat, p.gym_lng, pos.latitude, pos.longitude));
      const ok = dist - Math.min(pos.accuracy || 0, 150) <= 250;
      if (ok) { await saveCheckin(true, dist); return; }
      busy(btn, false);
      sheet(`<div class="sheet-owl">${yofi("alerta", 72)}</div><h3>Estás a ${dist >= 1000 ? kg(dist / 1000) + " km" : dist + " m"} do teu ginásio</h3><p class="muted">O check-in só conta quando estás no ginásio. Mudaste de ginásio? Guarda este sítio como o novo.</p>
        <div class="stack"><button class="btn" id="sMove">Mudei de ginásio: guardar aqui</button><button class="btn ghost" data-close>Fechar</button></div>`, (w) => {
        $("#sMove", w).addEventListener("click", async (e) => { busy(e.currentTarget, true); try { await store.updateProfile({ gym_lat: pos.latitude, gym_lng: pos.longitude }); await saveCheckin(true, 0, true); closeSheet(); } catch (er) { toast(er.message, "bad"); } });
      });
    } catch (e) {
      busy(btn, false);
      sheet(`<div class="sheet-owl">${yofi("alerta", 72)}</div><h3>Sem localização</h3><p class="muted">${esc(e.message)} Podes fazer check-in sem GPS, mas aparece no feed como "sem GPS" e os teus amigos podem contestar com 👀.</p>
        <div class="stack"><button class="btn" id="sNoGps">Fazer check-in sem GPS</button><button class="btn ghost" data-close>Cancelar</button></div>`, (w) => {
        $("#sNoGps", w).addEventListener("click", async (ev) => { busy(ev.currentTarget, true); try { await saveCheckin(false, null); closeSheet(); } catch (er) { toast(er.message, "bad"); } });
      });
    }
  }
  async function saveCheckin(verified, dist, moved) {
    const before = weekStats(me().id).visits;
    await store.addCheckin({ verified, distance_m: dist });
    await store.addPost({ kind: "checkin", meta: { verified, moved: !!moved } });
    await loadCore();
    const st = weekStats(me().id);
    if (before < st.target && st.visits >= st.target) await store.addPost({ kind: "goal", meta: { visits: st.visits, target: st.target } });
    toast(st.visits >= st.target ? "Meta da semana cumprida! 🦉" : `Check-in feito · ${st.visits}/${st.target} esta semana`, "good");
    await refresh();
  }
  async function doWeighin(e) {
    e.preventDefault();
    const v = parseFloat(String($("#wIn").value).replace(",", "."));
    if (!(v >= 30 && v <= 300)) { toast("Escreve o peso em kg, por exemplo 96,4.", "bad"); return; }
    const btn = e.submitter || $("#wForm button"); busy(btn, true);
    try {
      const uid = me().id, list = S.weighins.filter((w) => w.user_id === uid), ws = weekStart();
      const firstThisWeek = !list.some((w) => new Date(w.created_at) >= ws);
      const prevStart = weekStartWeight(list, new Date(ws.getTime() - 7 * DAY));
      await store.addWeighin(v);
      if (firstThisWeek) {
        const goal = Number(me().weight_goal_kg || 0);
        if (prevStart) { const delta = Math.round((v - Number(prevStart.kg)) * 10) / 10; await store.addPost({ kind: "weighin", meta: { delta, goal, result: weighResult(delta, goal) } }); }
        else await store.addPost({ kind: "weighin", meta: { first: true, goal } });
      }
      toast("Pesagem registada", "good"); await refresh();
    } catch (er) { toast(er.message, "bad"); busy(btn, false); }
  }

  // ---------- FEED ----------
  let feedOpen = new Set();
  async function vFeed() {
    $("#view").innerHTML = `
      <form class="card composer" id="cmp">
        <div class="cmp-row">${avatar(me(), 38)}<label for="cmpTxt" class="sr">Mensagem para o grupo</label><textarea id="cmpTxt" rows="2" maxlength="1000" placeholder="Escreve algo ao grupo…"></textarea></div>
        <div id="cmpPrev"></div>
        <div class="row-between"><label class="btn ghost sm" for="cmpImg">Foto</label><input type="file" id="cmpImg" accept="image/*" hidden><button class="btn primary sm" type="submit">Publicar</button></div>
      </form>
      <div id="posts"><div class="skeleton"></div><div class="skeleton"></div></div>`;
    let photo = null;
    $("#cmpImg").addEventListener("change", async (e) => { const f = e.target.files[0]; if (!f) return; photo = await shrink(f); $("#cmpPrev").innerHTML = `<div class="prev"><img src="${URL.createObjectURL(photo)}" alt="Pré-visualização da foto"><button type="button" class="x" aria-label="Remover foto">×</button></div>`; $("#cmpPrev .x").onclick = () => { photo = null; $("#cmpPrev").innerHTML = ""; }; });
    $("#cmp").addEventListener("submit", async (e) => {
      e.preventDefault(); const body = $("#cmpTxt").value.trim(); if (!body && !photo) return;
      const b = e.submitter; busy(b, true, "A publicar…");
      try { const photo_url = photo ? await store.uploadPhoto(photo) : null; await store.addPost({ kind: photo ? "photo" : "text", body, photo_url }); $("#cmpTxt").value = ""; photo = null; $("#cmpPrev").innerHTML = ""; await drawPosts(); }
      catch (er) { toast(er.message, "bad"); } busy(b, false);
    });
    await drawPosts();
  }
  async function drawPosts() {
    const box = $("#posts"); if (!box) return;
    let posts, reacts, comms;
    try { posts = await store.posts(60); const ids = posts.map((p) => p.id); [reacts, comms] = await Promise.all([store.reactions(ids), store.comments(ids)]); }
    catch (e) { box.innerHTML = `<p class="muted center">${esc(e.message)}</p>`; return; }
    if (!posts.length) { box.innerHTML = `<div class="empty">${yofi("ola", 80)}<p>O feed está vazio. Faz o primeiro check-in ou escreve algo ao grupo.</p></div>`; return; }
    box.innerHTML = posts.map((p) => postCard(p, reacts.filter((r) => r.post_id === p.id), comms.filter((c) => c.post_id === p.id))).join("");
    $$(".react", box).forEach((b) => b.addEventListener("click", async () => {
      const on = !b.classList.contains("mine"); b.classList.toggle("mine", on);
      const n = b.querySelector("i"); n.textContent = Math.max(0, (parseInt(n.textContent) || 0) + (on ? 1 : -1)) || "";
      try { await store.toggleReaction(b.dataset.p, b.dataset.e, on); } catch (e) { toast(e.message, "bad"); }
    }));
    $$(".cm-toggle", box).forEach((b) => b.addEventListener("click", () => { const id = b.dataset.p; feedOpen.has(id) ? feedOpen.delete(id) : feedOpen.add(id); b.closest(".post").classList.toggle("open"); b.closest(".post").querySelector("input")?.focus(); }));
    $$(".cm-form", box).forEach((f) => f.addEventListener("submit", async (e) => { e.preventDefault(); const i = f.querySelector("input"); const t = i.value.trim(); if (!t) return; i.disabled = true; try { await store.addComment(f.dataset.p, t); feedOpen.add(f.dataset.p); await drawPosts(); } catch (er) { toast(er.message, "bad"); i.disabled = false; } }));
  }
  function postBody(p) {
    const m = p.meta || {};
    switch (p.kind) {
      case "checkin": return `<p class="act">📍 fez check-in no ginásio ${m.verified ? `<span class="chip good">GPS confirmado</span>` : `<span class="chip warn">sem GPS</span>`}${m.moved ? ` <span class="chip">mudou de ginásio</span>` : ""}</p>`;
      case "workout": return `<p class="act">🏋️ terminou o treino <b>${esc(m.title)}</b></p><div class="chips"><span class="chip">${m.n_ex} ${m.n_ex === 1 ? "exercício" : "exercícios"}</span><span class="chip">${m.n_sets} ${m.n_sets === 1 ? "série" : "séries"}</span><span class="chip">${kg(m.volume || 0, 0)} kg de volume</span></div>${(m.prs || []).map((r) => `<div class="pr">🏆 Novo recorde: <b>${esc(r.ex)}</b> ${kg(r.kg)} kg × ${r.reps}</div>`).join("")}`;
      case "weighin": return m.first ? `<p class="act">⚖️ começou a acompanhar o peso · meta: ${esc(goalLabel(m.goal || 0))}</p>` : `<p class="act">⚖️ pesagem semanal: <b>${signed(m.delta)} kg</b> <span class="chip ${m.result}">${{ cumpriu: "meta cumprida ✓", perto: "quase lá", falhou: "meta falhada" }[m.result] || ""}</span></p><small class="muted">Meta: ${esc(goalLabel(m.goal || 0))}</small>`;
      case "goal": return `<p class="act">🎯 cumpriu a meta da semana · <b>${m.visits}/${m.target} idas</b></p>`;
      default: return `${p.body ? `<p class="txt">${esc(p.body)}</p>` : ""}${p.photo_url ? `<img class="ph" src="${esc(p.photo_url)}" alt="Foto publicada por ${esc(S.byId[p.user_id]?.name || "um membro")}" loading="lazy">` : ""}`;
    }
  }
  function postCard(p, rs, cs) {
    const u = S.byId[p.user_id] || { name: "Ex-membro", color: "#64748b" };
    const open = feedOpen.has(p.id);
    return `<article class="post card ${open ? "open" : ""} k-${esc(p.kind)}">
      <header>${avatar(u)}<div><b>${esc(u.name)}</b><small>${ago(p.created_at)}</small></div></header>
      ${postBody(p)}
      <div class="reacts">${EMOJIS.map((e) => { const n = rs.filter((r) => r.emoji === e).length, mine = rs.some((r) => r.emoji === e && r.user_id === me().id); return `<button class="react ${mine ? "mine" : ""}" data-p="${p.id}" data-e="${e}" aria-label="Reagir ${e}">${e}<i>${n || ""}</i></button>`; }).join("")}
        <button class="cm-toggle" data-p="${p.id}">${cs.length ? `${cs.length} ${cs.length === 1 ? "comentário" : "comentários"}` : "Comentar"}</button></div>
      <div class="cms">${cs.map((c) => { const cu = S.byId[c.user_id] || { name: "?" }; return `<div class="cm">${avatar(cu, 26)}<p><b>${esc(cu.name)}</b> ${esc(c.body)}</p></div>`; }).join("")}
        <form class="cm-form" data-p="${p.id}"><label class="sr" for="c${p.id}">Comentário</label><input id="c${p.id}" maxlength="500" placeholder="Escreve um comentário…"><button class="btn sm">Enviar</button></form></div>
    </article>`;
  }
  async function shrink(file) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    const max = 1080, s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, "image/jpeg", 0.82));
  }

  // ---------- TREINO ----------
  const DKEY = "yfxgym-draft";
  const getDraft = () => { try { return JSON.parse(localStorage.getItem(DKEY)); } catch (e) { return S._draft || null; } };
  const setDraft = (d) => { S._draft = d; try { d ? localStorage.setItem(DKEY, JSON.stringify(d)) : localStorage.removeItem(DKEY); } catch (e) {} };
  const exType = (n) => (EXERCISES.find((e) => e.n === n) || { t: "w" }).t;
  const NOMES_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

  function bestByEx(workouts) {
    const best = {};
    workouts.forEach((w) => (w.sets || []).forEach((s) => { if (s.kg > 0 && (!best[s.ex] || s.kg > best[s.ex].kg)) best[s.ex] = { kg: s.kg, reps: s.reps }; }));
    return best;
  }
  function vTreino() {
    const d = getDraft();
    if (!d) {
      const mine = S.allWorkouts.filter((w) => w.user_id === me().id);
      const best = bestByEx(mine);
      $("#view").innerHTML = `
        <section class="card start">
          <div class="row-gap">${yofi("normal", 64)}<div><h2>Treino de hoje</h2><p class="muted">Regista séries, repetições e carga. Os recordes pessoais aparecem sozinhos no feed.</p></div></div>
          <button class="btn primary big" id="startW">Começar treino</button>
        </section>
        <section class="card">
          <span class="eyebrow">As tuas melhores marcas</span>
          <div class="big3">${BIG3.map((b) => `<div><small>${esc(b.replace(" (barra)", ""))}</small><b>${best[b] ? kg(best[b].kg) + "<i>kg</i>" : "—"}</b></div>`).join("")}</div>
        </section>
        <section><h3 class="sec">Histórico</h3>${mine.length ? mine.slice(0, 15).map((w) => `<div class="card hist"><div class="row-between"><b>${esc(w.title)}</b><small class="muted">${ago(w.created_at)}</small></div><small class="muted">${new Set((w.sets || []).map((s) => s.ex)).size} exerc. · ${(w.sets || []).length} séries · ${kg(w.volume, 0)} kg</small>${(w.prs || []).map((r) => `<div class="pr">🏆 ${esc(r.ex)} ${kg(r.kg)} kg × ${r.reps}</div>`).join("")}</div>`).join("") : `<p class="muted">Ainda não registaste nenhum treino.</p>`}</section>`;
      $("#startW").addEventListener("click", () => { setDraft({ title: "Treino de " + NOMES_DIA[new Date().getDay()], startedAt: Date.now(), items: [] }); vTreino(); openPicker(); });
      return;
    }
    const mins = Math.floor((Date.now() - d.startedAt) / 60000);
    $("#view").innerHTML = `
      <section class="card">
        <div class="row-between"><span class="eyebrow">Em curso · ${mins} min</span><button class="link" id="cancelW">Descartar</button></div>
        <label class="sr" for="wTitle">Nome do treino</label><input id="wTitle" class="title-in" value="${esc(d.title)}" maxlength="60">
      </section>
      <div id="items">${d.items.map((it, i) => itemCard(it, i)).join("")}</div>
      <button class="btn ghost wide" id="addEx">+ Adicionar exercício</button>
      <button class="btn primary big" id="finishW">Terminar e publicar</button>`;
    $("#wTitle").addEventListener("input", (e) => { d.title = e.target.value; setDraft(d); });
    $("#addEx").addEventListener("click", openPicker);
    $("#cancelW").addEventListener("click", () => sheet(`<h3>Descartar este treino?</h3><p class="muted">As séries registadas perdem-se.</p><div class="stack"><button class="btn danger" id="sDisc">Descartar treino</button><button class="btn ghost" data-close>Continuar a treinar</button></div>`, (w) => $("#sDisc", w).addEventListener("click", () => { setDraft(null); closeSheet(); vTreino(); })));
    $("#finishW").addEventListener("click", finishWorkout);
    const box = $("#items");
    box.addEventListener("input", (e) => { const t = e.target; if (!t.dataset.f) return; const it = d.items[t.dataset.i], s = it.sets[t.dataset.s]; s[t.dataset.f] = parseFloat(String(t.value).replace(",", ".")) || 0; setDraft(d); });
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return; const i = +b.dataset.i;
      if (b.dataset.a === "add") { const last = d.items[i].sets.slice(-1)[0] || { reps: 10, kg: 0 }; d.items[i].sets.push({ reps: last.reps, kg: last.kg }); }
      if (b.dataset.a === "del") { d.items[i].sets.splice(+b.dataset.s, 1); if (!d.items[i].sets.length) d.items.splice(i, 1); }
      if (b.dataset.a === "rm") d.items.splice(i, 1);
      setDraft(d); vTreino();
    });
  }
  function itemCard(it, i) {
    const t = exType(it.ex), lr = t === "time" ? "min" : "reps", lk = t === "w" ? "kg" : t === "bw" ? "kg extra" : "";
    return `<section class="card item"><div class="row-between"><b>${esc(it.ex)}</b><button class="link" data-a="rm" data-i="${i}" aria-label="Remover ${esc(it.ex)}">Remover</button></div>
      <div class="sets"><div class="set head"><span>Série</span><span>${lr}</span>${lk ? `<span>${lk}</span>` : "<span></span>"}<span></span></div>
      ${it.sets.map((s, j) => `<div class="set"><span class="n">${j + 1}</span><input inputmode="decimal" aria-label="${lr} série ${j + 1}" data-i="${i}" data-s="${j}" data-f="reps" value="${s.reps || ""}">${lk ? `<input inputmode="decimal" aria-label="${lk} série ${j + 1}" data-i="${i}" data-s="${j}" data-f="kg" value="${s.kg || ""}">` : "<span></span>"}<button class="x" data-a="del" data-i="${i}" data-s="${j}" aria-label="Apagar série ${j + 1}">×</button></div>`).join("")}</div>
      <button class="btn ghost sm" data-a="add" data-i="${i}">+ Série</button></section>`;
  }
  function openPicker() {
    const groups = [...new Set(EXERCISES.map((e) => e.g))];
    sheet(`<h3>Adicionar exercício</h3><label class="sr" for="exQ">Procurar exercício</label><input id="exQ" placeholder="Procurar (ex. supino)" autocomplete="off">
      <div class="ex-list" id="exList"></div>`, (w) => {
      const draw = (q) => {
        const qq = q.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        const match = (e) => e.n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(qq);
        let html = groups.map((g) => { const xs = EXERCISES.filter((e) => e.g === g && match(e)); return xs.length ? `<h4>${g}</h4>${xs.map((e) => `<button class="ex" data-n="${esc(e.n)}">${esc(e.n)}</button>`).join("")}` : ""; }).join("");
        if (qq && !EXERCISES.some((e) => e.n.toLowerCase() === qq)) html += `<button class="ex custom" data-n="${esc(q.trim())}">+ Usar "${esc(q.trim())}"</button>`;
        $("#exList", w).innerHTML = html || `<p class="muted">Nada encontrado.</p>`;
      };
      draw(""); $("#exQ", w).addEventListener("input", (e) => draw(e.target.value));
      $("#exList", w).addEventListener("click", (e) => { const b = e.target.closest(".ex"); if (!b) return; const d = getDraft(); d.items.push({ ex: b.dataset.n, sets: [{ reps: exType(b.dataset.n) === "time" ? 20 : 10, kg: 0 }] }); setDraft(d); closeSheet(); vTreino(); });
    });
  }
  async function finishWorkout() {
    const d = getDraft();
    const sets = d.items.flatMap((it) => it.sets.filter((s) => s.reps > 0).map((s) => ({ ex: it.ex, reps: s.reps, kg: s.kg || 0 })));
    if (!sets.length) { toast("Regista pelo menos uma série com repetições.", "bad"); return; }
    const btn = $("#finishW"); busy(btn, true, "A guardar…");
    try {
      const prevBest = bestByEx(S.allWorkouts.filter((w) => w.user_id === me().id));
      const nowBest = bestByEx([{ sets }]);
      const prs = Object.entries(nowBest).filter(([ex, b]) => prevBest[ex] && b.kg > prevBest[ex].kg).map(([ex, b]) => ({ ex, kg: b.kg, reps: b.reps }));
      const volume = Math.round(sets.reduce((s, x) => s + x.kg * x.reps * (exType(x.ex) === "time" ? 0 : 1), 0));
      const title = (d.title || "Treino").trim().slice(0, 60);
      const w = await store.addWorkout({ title, sets, volume, prs });
      await store.addPost({ kind: "workout", meta: { workout_id: w.id, title, n_ex: new Set(sets.map((s) => s.ex)).size, n_sets: sets.length, volume, prs } });
      setDraft(null); await loadCore();
      sheet(`<div class="sheet-owl">${yofi("celebra", 88)}</div><h3>${prs.length ? `${prs.length} ${prs.length === 1 ? "recorde novo" : "recordes novos"}!` : "Treino guardado"}</h3>
        <p class="muted">${sets.length} séries · ${kg(volume, 0)} kg de volume. Já está no feed do grupo.</p>${prs.map((r) => `<div class="pr">🏆 ${esc(r.ex)} ${kg(r.kg)} kg × ${r.reps}</div>`).join("")}
        <div class="stack"><button class="btn primary" id="sFeed">Ver no feed</button><button class="btn ghost" data-close>Fechar</button></div>`, (wr) => $("#sFeed", wr).addEventListener("click", () => { closeSheet(); go("feed"); }));
      vTreino();
    } catch (e) { toast(e.message, "bad"); busy(btn, false); }
  }

  // ---------- RANKING ----------
  function vRanking() {
    const r = ranking(), ws = weekStart(), we = new Date(ws.getTime() + 6 * DAY);
    const mes = (d) => d.toLocaleDateString("pt-PT", { day: "numeric", month: "short" });
    const lead = r[0], last = r[r.length - 1];
    const bestAll = {}; S.members.forEach((m) => { bestAll[m.id] = bestByEx(S.allWorkouts.filter((w) => w.user_id === m.id)); });
    const medal = ["🥇", "🥈", "🥉"];
    $("#view").innerHTML = `
      <section class="card vigia small">
        <div class="vigia-owl">${yofi(lead && lead.pct === 100 ? "celebra" : "alerta", 64)}</div>
        <div class="bubble"><span class="eyebrow">Semana de ${mes(ws)} a ${mes(we)}</span>
          <p>${lead && lead.visits ? `${esc(lead.m.name)} vai à frente com ${lead.pct}% da meta.` : "Ninguém fez check-in ainda esta semana. Quem abre a semana?"}${last && r.length > 1 && last.m.id !== lead.m.id ? ` ${esc(last.m.name)}, estou de olho em ti 👀` : ""}</p></div>
      </section>
      <ol class="rank">${r.map((x, i) => `<li class="card ${x.m.id === me().id ? "me" : ""}">
        <span class="pos">${medal[i] || i + 1}</span>${avatar(x.m, 42)}
        <div class="rk-main"><div class="row-between"><b>${esc(x.m.name)}${x.m.id === me().id ? " <small>(tu)</small>" : ""}</b><b class="pct">${x.pct}%</b></div>
          <div class="bar"><span style="width:${x.pct}%"></span></div>
          <small class="muted">${x.visits}/${x.target} idas · ${x.workouts} ${x.workouts === 1 ? "treino" : "treinos"}${x.weight && x.weight.thisWeek && x.weight.delta !== 0 ? ` · ${signed(x.weight.delta)} kg` : ""}</small></div></li>`).join("")}</ol>
      <p class="muted note">Ordenado pela % da meta semanal de cada um (máximo 100%). Desempate: número de idas e depois volume de treino.</p>
      <section class="card">
        <span class="eyebrow">Melhores marcas do grupo</span>
        <div class="b3t">${BIG3.map((b) => { const top = S.members.map((m) => ({ m, b: bestAll[m.id][b] })).filter((x) => x.b).sort((a, c) => c.b.kg - a.b.kg)[0]; return `<div class="row-between"><span>${esc(b.replace(" (barra)", ""))}</span>${top ? `<span>${avatar(top.m, 24)} <b>${kg(top.b.kg)} kg</b> <small class="muted">${esc(top.m.name)}</small></span>` : `<small class="muted">sem marcas</small>`}</div>`; }).join("")}</div>
        <small class="muted">Os ranks de força por peso corporal chegam na Versão 2.</small>
      </section>`;
  }

  // ---------- PERFIL ----------
  const COLORS = ["#22d3ee", "#3b82f6", "#34d399", "#f472b6", "#fbbf24", "#a78bfa"];
  const GOALS = [[-1, "Perder 1 kg por semana"], [-0.5, "Perder 0,5 kg por semana"], [0, "Manter o peso"], [0.25, "Ganhar 0,25 kg por semana"], [0.5, "Ganhar 0,5 kg por semana"]];
  function vPerfil() {
    const p = me(), g = S.group, link = location.origin + location.pathname + "?c=" + encodeURIComponent(g.invite_code);
    $("#view").innerHTML = `
      <section class="card prof-head">${avatar(p, 64)}<div><h2>${esc(p.name)}</h2><small class="muted">${esc(g.name)} · ${S.members.length} ${S.members.length === 1 ? "membro" : "membros"}</small></div></section>
      <form class="card form" id="pf">
        <label for="pName">Nome</label><input id="pName" value="${esc(p.name)}" maxlength="30" required>
        <span class="lbl">Cor</span><div class="swatches">${COLORS.map((c) => `<label class="sw" style="--c:${c}"><input type="radio" name="pColor" value="${c}" ${p.color === c ? "checked" : ""}><span class="sr">${c}</span></label>`).join("")}</div>
        <label for="pVis">Idas ao ginásio por semana</label>
        <div class="stepper"><button type="button" data-d="-1" aria-label="Menos">−</button><output id="pVisOut">${p.visits_target}</output><input type="hidden" id="pVis" value="${p.visits_target}"><button type="button" data-d="1" aria-label="Mais">+</button></div>
        <label for="pGoal">Meta de peso</label>
        <select id="pGoal">${GOALS.map(([v, l]) => `<option value="${v}" ${Number(p.weight_goal_kg) === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <button class="btn primary" type="submit">Guardar</button>
      </form>
      <section class="card">
        <span class="eyebrow">Convidar amigos</span>
        <p class="muted">Só entra no grupo quem tiver este código.</p>
        <div class="code"><b id="code">${esc(g.invite_code)}</b><button class="btn sm" id="share">Partilhar convite</button></div>
        <small class="muted sel">${esc(link)}</small>
      </section>
      <section class="card">
        <span class="eyebrow">O meu ginásio</span>
        <p class="muted">${p.gym_lat ? "Localização guardada. O check-in confirma que estás a menos de 250 m." : "Ainda não guardado. Fica guardado no teu primeiro check-in."}</p>
        ${p.gym_lat ? `<button class="btn ghost sm" id="resetGym">Esquecer localização do ginásio</button>` : ""}
      </section>
      <section class="stack">${store.mode === "demo" ? `<button class="btn ghost" id="resetDemo">Reiniciar demonstração</button>` : `<button class="btn ghost" id="logout">Terminar sessão</button>`}</section>
      <div class="sign">${yofi("ola", 56)}<p>YFX Gym · Versão 1<br><small>powered by YFX · Maputo</small></p></div>`;
    $$(".stepper button").forEach((b) => b.addEventListener("click", () => { const i = $("#pVis"); const v = Math.max(2, Math.min(7, +i.value + +b.dataset.d)); i.value = v; $("#pVisOut").textContent = v; }));
    $("#pf").addEventListener("submit", async (e) => {
      e.preventDefault(); const b = e.submitter; busy(b, true);
      try { await store.updateProfile({ name: $("#pName").value.trim() || p.name, color: ($("input[name=pColor]:checked") || {}).value || p.color, visits_target: +$("#pVis").value, weight_goal_kg: +$("#pGoal").value }); toast("Perfil guardado", "good"); await refresh(); }
      catch (er) { toast(er.message, "bad"); busy(b, false); }
    });
    $("#share").addEventListener("click", async () => {
      const text = `Entra no nosso grupo "${g.name}" no YFX Gym. Código: ${g.invite_code}\n${link}`;
      try { if (navigator.share) { await navigator.share({ title: "YFX Gym", text }); return; } } catch (e) { if (e.name === "AbortError") return; }
      try { await navigator.clipboard.writeText(text); toast("Convite copiado. Cola no WhatsApp do grupo.", "good"); } catch (e) { const r = document.createRange(); r.selectNodeContents($(".sel")); getSelection().removeAllRanges(); getSelection().addRange(r); toast("Copia o link selecionado."); }
    });
    $("#resetGym")?.addEventListener("click", async () => { await store.updateProfile({ gym_lat: null, gym_lng: null }); toast("Localização esquecida"); vPerfil(); });
    $("#resetDemo")?.addEventListener("click", async () => { store.reset(); setDraft(null); await refresh(); go("inicio"); toast("Demonstração reiniciada"); });
    $("#logout")?.addEventListener("click", async () => { await store.signOut(); location.href = location.pathname; });
  }

  // ---------- ENTRADA (modo real) ----------
  function vAuth(mode = "in", note = "") {
    document.body.classList.remove("in-app");
    $("#app").innerHTML = `<main class="auth">
      <div class="auth-owl">${yofi("ola", 120)}</div>
      <h1 class="wordmark big">YFX <b>GYM</b></h1>
      <p class="muted center">O ginásio do teu grupo de amigos. A Yofi vigia, vocês competem.</p>
      ${note ? `<div class="note-box">${esc(note)}</div>` : ""}
      <div class="seg" role="tablist"><button role="tab" class="${mode === "in" ? "on" : ""}" data-m="in">Entrar</button><button role="tab" class="${mode === "up" ? "on" : ""}" data-m="up">Criar conta</button></div>
      <form class="card form" id="af">
        ${mode === "up" ? `<label for="aName">O teu nome</label><input id="aName" maxlength="30" autocomplete="given-name" required>` : ""}
        <label for="aEmail">Email</label><input id="aEmail" type="email" autocomplete="email" required>
        <label for="aPw">Palavra-passe</label><input id="aPw" type="password" minlength="6" autocomplete="${mode === "up" ? "new-password" : "current-password"}" required>
        <button class="btn primary" type="submit">${mode === "up" ? "Criar conta" : "Entrar"}</button>
      </form>
      <footer class="powered static">powered by <b>YFX</b></footer></main>`;
    $$(".seg button").forEach((b) => b.addEventListener("click", () => vAuth(b.dataset.m)));
    $("#af").addEventListener("submit", async (e) => {
      e.preventDefault(); const b = e.submitter; busy(b, true);
      try {
        if (mode === "up") { const r = await store.signUp($("#aEmail").value.trim(), $("#aPw").value, $("#aName").value.trim()); if (r === "confirm") return vAuth("in", `Enviámos um email de confirmação para ${$("#aEmail")?.value || "o teu email"}. Confirma e depois entra aqui.`); }
        else await store.signIn($("#aEmail").value.trim(), $("#aPw").value);
        await afterLogin();
      } catch (er) { toast(er.message, "bad"); busy(b, false); }
    });
  }
  function vGroupSetup() {
    const code = new URLSearchParams(location.search).get("c") || "";
    $("#app").innerHTML = `<main class="auth">
      <div class="auth-owl">${yofi("normal", 96)}</div>
      <h1 class="wordmark big">Olá, ${esc(me()?.name || "atleta")}</h1>
      <p class="muted center">Entra no grupo dos teus amigos com o código de convite, ou cria um grupo novo.</p>
      <form class="card form" id="jf"><label for="jCode">Código de convite</label><input id="jCode" value="${esc(code)}" autocapitalize="characters" maxlength="12" required><button class="btn primary" type="submit">Entrar no grupo</button></form>
      <div class="or">ou</div>
      <form class="card form" id="cf"><label for="cName">Nome do grupo</label><input id="cName" maxlength="40" placeholder="Ex.: Os Monstros do Ferro" required><button class="btn" type="submit">Criar grupo</button></form>
      <footer class="powered static">powered by <b>YFX</b></footer></main>`;
    $("#jf").addEventListener("submit", async (e) => { e.preventDefault(); const b = e.submitter; busy(b, true); try { await store.joinGroup($("#jCode").value.trim().toUpperCase()); await afterLogin(); } catch (er) { toast(er.message, "bad"); busy(b, false); } });
    $("#cf").addEventListener("submit", async (e) => { e.preventDefault(); const b = e.submitter; busy(b, true); try { await store.createGroup($("#cName").value.trim()); await afterLogin(); } catch (er) { toast(er.message, "bad"); busy(b, false); } });
  }
  async function afterLogin() {
    if (!store.profile) await store.loadProfile();
    if (!store.profile?.group_id) return vGroupSetup();
    history.replaceState(null, "", location.pathname);
    document.body.classList.add("in-app"); buildShell(); store.subscribe(() => { loadCore().then(() => { if (S.view === "feed") drawPosts(); else if (!$(".sheet-wrap") && S.view !== "treino") render(); }); });
    await refresh();
  }

  // ---------- arranque ----------
  async function boot() {
    store = window.makeStore();
    try {
      const logged = await store.init();
      if (store.mode === "live" && !logged) return vAuth(new URLSearchParams(location.search).get("c") ? "up" : "in");
      await afterLogin();
    } catch (e) { $("#app").innerHTML = `<main class="auth"><div class="auth-owl">${yofi("alerta", 96)}</div><p class="center">Não consegui abrir a app: ${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Tentar outra vez</button></main>`; }
  }
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && store && store.profile?.group_id && document.body.classList.contains("in-app")) refresh(); });
  boot();
})();
