/* YFX Gym — V1 (auditada). Vanilla JS, sem build. Powered by YFX. */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const kg = (n, d = 1) => num(n).toLocaleString("pt-PT", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + kg(Math.abs(n));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
  const DIAS = ["S", "T", "Q", "Q", "S", "S", "D"];
  const DIAS_NOME = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
  const EMOJIS = [["🔥", "fogo"], ["💪", "força"], ["👏", "palmas"], ["😂", "riso"], ["👀", "de olho"]];
  const BIG3 = window.BIG3;

  // datas "YYYY-MM-DD" vindas do servidor (fuso do grupo) → aritmética sem fuso do telemóvel
  const addDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
  const shortDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("pt-PT", { day: "numeric", month: "short", timeZone: "UTC" }); };
  const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);

  const S = { view: "inicio", members: [], byId: {}, rank: [], me: null, weight: null, gym: null, days: new Set(), today: null, ws: null, tz: "Africa/Maputo", stale: null, rankWeeks: 0 };
  let store;

  // ---------- util UI ----------
  function toast(msg, kind = "") {
    const t = document.createElement("div");
    t.className = "toast " + kind; t.textContent = msg; t.setAttribute("role", kind === "bad" ? "alert" : "status");
    $("#toasts").appendChild(t);
    setTimeout(() => t.classList.add("out"), 3200); setTimeout(() => t.remove(), 3700);
  }
  const errMsg = (e) => (e && e.message) || "Algo correu mal. Tenta outra vez.";
  let lastFocus = null;
  function sheet(html, onMount) {
    closeSheet(true);
    lastFocus = document.activeElement;
    const w = document.createElement("div");
    w.className = "sheet-wrap";
    w.innerHTML = `<div class="sheet-bg" data-close></div><div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><div class="sheet-grab" aria-hidden="true"></div>${html}</div>`;
    document.body.appendChild(w);
    document.body.classList.add("no-scroll");
    requestAnimationFrame(() => w.classList.add("open"));
    w.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
    w.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSheet();
      if (e.key === "Tab") { const f = $$("button, input, select, textarea, [href]", w).filter((x) => !x.disabled); if (!f.length) return; const first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    });
    onMount && onMount(w);
    setTimeout(() => (($("input, button.primary, button", $(".sheet", w))) || $(".sheet", w)).focus({ preventScroll: true }), 60);
    return w;
  }
  function closeSheet(instant) {
    const ws = $$(".sheet-wrap:not(.closing)"); if (!ws.length) return;
    ws.forEach((w) => { w.classList.remove("open"); w.classList.add("closing"); setTimeout(() => w.remove(), instant ? 0 : 250); });
    document.body.classList.remove("no-scroll");
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  const confirmSheet = (title, text, okLabel, danger) => new Promise((res) => {
    let done = false;
    sheet(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p><div class="stack"><button class="btn ${danger ? "danger" : "primary"}" id="cOk">${esc(okLabel)}</button><button class="btn ghost" data-close>Cancelar</button></div>`, (w) => {
      $("#cOk", w).addEventListener("click", () => { done = true; closeSheet(); res(true); });
      const obs = new MutationObserver(() => { if (!document.contains(w)) { obs.disconnect(); if (!done) res(false); } }); obs.observe(document.body, { childList: true });
    });
  });
  function avatar(p, size = 40, urls = S.urls || {}) {
    const name = p?.name || "?";
    const ini = name.trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
    const u = p?.avatar_path && urls[p.avatar_path];
    return u ? `<img class="av av-img" src="${esc(u)}" alt="" style="--s:${size}px" width="${size}" height="${size}" loading="lazy" decoding="async">`
      : `<span class="av" style="--c:${esc(/^#[0-9a-f]{6}$/i.test(p?.color || "") ? p.color : "#22d3ee")};--s:${size}px" aria-hidden="true">${esc(ini)}</span>`;
  }
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return "agora"; if (s < 3600) return `há ${Math.floor(s / 60)} min`; if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
    const d = Math.floor(s / 86400); if (d === 1) return "ontem"; if (d < 7) return `há ${d} dias`;
    return new Date(iso).toLocaleDateString("pt-PT", { day: "numeric", month: "short", timeZone: S.tz });
  }
  const hhmm = (iso) => new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: S.tz });
  const busy = (btn, on, label) => { if (!btn) return; btn.disabled = on; btn.setAttribute("aria-busy", on ? "true" : "false"); if (on) { btn.dataset.l = btn.innerHTML; btn.innerHTML = esc(label || "Aguarda…"); } else if (btn.dataset.l) btn.innerHTML = btn.dataset.l; };
  function needOnline() { if (navigator.onLine) return true; toast("Estás sem internet. Esta ação precisa de rede.", "bad"); return false; }
  const goalLabel = (g) => { g = num(g); return g < 0 ? `perder ${kg(-g, 2)} kg/semana` : g > 0 ? `ganhar ${kg(g, 2)} kg/semana` : "manter o peso"; };
  const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "Alguém";

  // ---------- dados ----------
  const cacheKey = () => "yfxgym-cache-" + store.uid;
  async function loadCore() {
    try {
      const [group, members, rank, weight, gym] = await Promise.all([store.getGroup(), store.members(), store.ranking(0), store.myWeight(), store.myGym()]);
      const ws = weight.week_start, today = weight.today;
      const days = await store.myCheckinDays(ws);
      Object.assign(S, { group, members, rank, weight, gym, ws, today, tz: group.timezone || "Africa/Maputo", stale: null });
      S.todayCheckin = days.find((d) => d.local_date === today) || null;
      S.days = new Set(days.map((d) => d.local_date));
      try { localStorage.setItem(cacheKey(), JSON.stringify({ at: Date.now(), group, members, rank, weight, gym, days })); } catch (e) {}
    } catch (e) {
      let c = null; try { c = JSON.parse(localStorage.getItem(cacheKey())); } catch (er) {}
      if (!c) throw e;
      Object.assign(S, { group: c.group, members: c.members, rank: c.rank, weight: c.weight, gym: c.gym, ws: c.weight.week_start, today: c.weight.today, tz: c.group.timezone || "Africa/Maputo", stale: c.at });
      S.days = new Set(c.days.map((d) => d.local_date)); S.todayCheckin = c.days.find((d) => d.local_date === S.today) || null;
    }
    S.byId = Object.fromEntries(S.members.map((m) => [m.id, m]));
    S.me = S.rank.find((r) => r.user_id === store.uid) || { visits: 0, target: store.profile.visits_target, pct: 0, workouts: 0, volume: 0 };
    S.urls = await store.signedUrls(S.members.map((m) => m.avatar_path));
  }

  // ---------- Yofi, a vigia: curta, divertida, sem spam ----------
  function vigia() {
    const me = S.me, w = S.weight || {}, wd = num(w.weekday, 1), daysLeft = 8 - wd;
    const visits = num(me.visits), target = num(me.target, 4), falta = Math.max(0, target - visits);
    const lines = []; let pose = "normal";
    const noWeights = w.current == null;
    if ((wd <= 2 && !w.this_week) || noWeights) { pose = "alerta"; lines.push(wd === 1 ? "Segunda-feira, dia de balança. Sobe lá e regista o peso." : noWeights ? "Ainda não sei o teu peso. Regista-o para eu acompanhar a meta." : "Ainda não te pesaste esta semana. Balança, já!"); }
    else if (visits >= target) { pose = "celebra"; lines.push(visits > target ? `${visits}/${target}. Meta batida e ainda vieste mais. Respeito.` : `Meta cumprida: ${visits}/${target}. O resto da semana é bónus.`); }
    else if (S.todayCheckin) { pose = "ola"; lines.push(visits === 1 ? "Primeira ida da semana. Assim é que se começa." : `Check-in feito. ${visits}/${target} esta semana.`); }
    else if (falta > daysLeft) { pose = "alerta"; lines.push(`Já não dá 100% esta semana. Cada ida ainda sobe a tua %.`); }
    else { pose = "alerta"; lines.push(`Faltam ${falta} ${falta === 1 ? "ida" : "idas"} e restam ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}. Hoje conta?`); }
    const lazy = S.rank.filter((r) => r.user_id !== store.uid).map((r) => ({ r, d: r.last_visit ? daysBetween(r.last_visit, S.today) : null })).filter((x) => x.d === null || x.d >= 4).sort((a, b) => (b.d ?? 99) - (a.d ?? 99))[0];
    if (lazy) lines.push(lazy.d === null ? `${firstName(lazy.r.name)} ainda não fez nenhum check-in. Estou de olho 👀` : `${firstName(lazy.r.name)} não aparece há ${lazy.d} dias. Estou de olho 👀`);
    else if (S.rank[0] && S.rank[0].user_id !== store.uid && S.rank[0].pct > 0) lines.push(`${firstName(S.rank[0].name)} lidera com ${S.rank[0].pct}%. Vais deixar?`);
    return { pose, lines: lines.slice(0, 2) };
  }

  // ---------- shell ----------
  const ICON = {
    inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    feed: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    treino: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
    ranking: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
    perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  };
  const TABS = [["inicio", "Início"], ["feed", "Feed"], ["treino", "Treino"], ["ranking", "Ranking"], ["perfil", "Perfil"]];
  const ico = (k) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
  function ymark(s) {
    return `<svg viewBox="0 0 64 64" width="${s}" height="${s}" aria-hidden="true"><defs><linearGradient id="ma" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2F4FB0"/><stop offset="1" stop-color="#3B82F6"/></linearGradient><linearGradient id="mb" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0891B2"/><stop offset="1" stop-color="#22D3EE"/></linearGradient><linearGradient id="mc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1D4ED8"/><stop offset="1" stop-color="#06B6D4"/></linearGradient></defs><polygon points="4,6 30,6 32,30 20,34" fill="url(#ma)"/><polygon points="34,6 60,6 44,34 32,30" fill="url(#mb)"/><polygon points="20,34 32,30 44,34 38,58 26,58" fill="url(#mc)"/><polygon points="30,6 34,6 32,30" fill="#243E94"/></svg>`;
  }
  function buildShell() {
    document.body.classList.add("in-app");
    $("#app").innerHTML = `
      <header class="top">
        <a class="brand" href="#inicio" aria-label="YFX Gym, início">${ymark(26)}<span class="wordmark">YFX <b>GYM</b></span></a>
        <div class="grp" id="grpName"></div>
      </header>
      <div id="netBar" class="net-bar" role="status" hidden></div>
      <main id="view" tabindex="-1"></main>
      <footer class="powered">powered by <b>YFX</b></footer>
      <nav class="tabs" aria-label="Navegação principal">${TABS.map(([k, l]) => `<a class="tab" href="#${k}" data-tab="${k}">${ico(k)}<span>${l}</span></a>`).join("")}</nav>`;
    updateNet();
  }
  function updateNet() {
    const b = $("#netBar"); if (!b) return;
    if (!navigator.onLine) { b.hidden = false; b.textContent = S.stale ? `Sem internet · a mostrar dados de ${new Date(S.stale).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}` : "Sem internet · as ações ficam bloqueadas até voltares a ter rede"; }
    else if (S.stale) { b.hidden = false; b.textContent = "A atualizar…"; }
    else b.hidden = true;
  }
  function route() {
    const v = (location.hash || "#inicio").slice(1);
    S.view = TABS.some(([k]) => k === v) ? v : "inicio";
    closeSheet(true);
    render(); window.scrollTo(0, 0);
  }
  const go = (v) => { if (location.hash === "#" + v) route(); else location.hash = v; };
  function render() {
    $$(".tab").forEach((b) => { const on = b.dataset.tab === S.view; b.classList.toggle("on", on); on ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"); });
    const g = $("#grpName"); if (g && S.group) g.textContent = S.group.name;
    document.title = (TABS.find(([k]) => k === S.view) || ["", "Início"])[1] + " · YFX Gym";
    updateNet();
    ({ inicio: vInicio, feed: vFeed, treino: vTreino, ranking: vRanking, perfil: vPerfil })[S.view]();
  }
  let lastRefresh = 0;
  async function refresh(force) {
    if (!force && Date.now() - lastRefresh < 20000) return;
    lastRefresh = Date.now();
    try { await loadCore(); } catch (e) { toast(errMsg(e), "bad"); }
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $("#view").contains(document.activeElement);
    if (!typing && !$(".sheet-wrap:not(.closing)") && S.view !== "treino") render(); else updateNet();
  }

  // ---------- INÍCIO ----------
  function vInicio() {
    const p = store.profile, me = S.me, v = vigia(), w = S.weight || {};
    const R = 46, C = 2 * Math.PI * R, frac = Math.min(1, num(me.visits) / Math.max(1, num(me.target, 4)));
    const res = w.delta == null || w.goal == null ? "" : w.delta === 0 ? "" : (num(w.goal) === 0 ? (Math.abs(w.delta) <= 0.5 ? "cumpriu" : "falhou") : (w.delta / w.goal >= 1 ? "cumpriu" : w.delta / w.goal >= 0.6 ? "perto" : "falhou"));
    $("#view").innerHTML = `
      <section class="vigia card" aria-label="Recado da Yofi">
        <div class="vigia-owl">${yofi(v.pose, 88)}</div>
        <div class="bubble"><span class="eyebrow">Yofi está a vigiar</span>${v.lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>
      </section>

      <section class="card checkin" aria-label="Check-in">
        ${S.todayCheckin ? `<div class="ck-done"><span class="ck-ok" aria-hidden="true">✓</span><div><b>Check-in feito às ${hhmm(S.todayCheckin.created_at)}</b><small>Localização confirmada no teu ginásio</small></div></div>`
        : `<button class="btn primary big" id="btnCheckin">${ico("pin")}<span>Cheguei ao ginásio · Check-in</span></button>
           <small class="hint">${S.gym?.saved ? "Confirmamos pela localização que estás no teu ginásio. Os amigos não veem onde estás." : "No primeiro check-in guardamos a localização do teu ginásio. Fica só contigo."}</small>`}
      </section>

      <section class="card goal" aria-label="Meta da semana">
        <div class="ring" role="img" aria-label="${num(me.visits)} de ${num(me.target)} idas">
          <svg viewBox="0 0 110 110" width="110" height="110" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
            <circle cx="55" cy="55" r="${R}" class="ring-bg"/><circle cx="55" cy="55" r="${R}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}" transform="rotate(-90 55 55)"/></svg>
          <div class="ring-txt" aria-hidden="true"><b>${num(me.visits)}<span>/${num(me.target)}</span></b><small>idas</small></div>
        </div>
        <div class="goal-side">
          <span class="eyebrow">Meta da semana</span>
          <h2>${num(me.pct)}% cumprido</h2>
          <div class="days" aria-label="Dias com check-in esta semana">${DIAS.map((d, i) => { const k = addDays(S.ws, i); const on = S.days.has(k); return `<span class="d ${on ? "on" : ""} ${k === S.today ? "today" : ""}" title="${DIAS_NOME[i]}${on ? ": check-in" : ""}">${d}</span>`; }).join("")}</div>
          <small class="muted">${num(me.workouts)} ${num(me.workouts) === 1 ? "treino registado" : "treinos registados"} · ${kg(me.volume, 0)} kg de volume</small>
        </div>
      </section>

      <section class="card weight" aria-label="Peso">
        <div class="row-between"><span class="eyebrow">Peso · ${esc(goalLabel(w.goal ?? p.weight_goal_kg))}</span>${w.this_week && w.delta ? `<span class="pill ${res}">${signed(w.delta)} kg</span>` : ""}</div>
        ${w.current != null ? `<div class="wgrid">
            <div><small>Início da semana</small><b>${w.start != null ? kg(w.start) : "—"}<i>kg</i></b></div>
            <div><small>Meta</small><b class="grad">${w.target != null ? kg(w.target) : "—"}<i>kg</i></b></div>
            <div><small>Atual</small><b>${kg(w.current)}<i>kg</i></b></div></div>`
        : `<p class="muted">Ainda não tens pesagens. Regista o peso de hoje para começar a semana.</p>`}
        <form class="wform" id="wForm" novalidate><label for="wIn" class="sr">Peso de hoje em kg</label>
          <input id="wIn" inputmode="decimal" autocomplete="off" placeholder="Peso (kg)" maxlength="6" enterkeyhint="done">
          <button class="btn" type="submit">${w.this_week && w.current != null ? "Atualizar" : "Registar"}</button></form>
        <small class="muted">Uma pesagem por dia (a última conta). O grupo vê só a variação da semana, nunca o teu peso.</small>
      </section>

      <a class="btn ghost wide" href="#treino">${ico("treino")}<span>Registar o treino de hoje</span></a>`;
    $("#btnCheckin")?.addEventListener("click", doCheckin);
    $("#wForm").addEventListener("submit", doWeighin);
  }

  // GPS: pede a melhor posição em até ~15 s (Safari/Chrome Android); nunca usa posição em cache
  function bestPosition() {
    return new Promise((res, rej) => {
      if (!("geolocation" in navigator)) return rej({ code: "NOSUPPORT" });
      if (!window.isSecureContext) return rej({ code: "INSECURE" });
      let best = null, done = false;
      const finish = (ok, err) => { if (done) return; done = true; navigator.geolocation.clearWatch(id); clearTimeout(t); ok ? res(best) : rej(err); };
      const id = navigator.geolocation.watchPosition((p) => {
        if (!best || p.coords.accuracy < best.accuracy) best = { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy };
        if (best.accuracy <= 35) finish(true);
      }, (e) => { if (best) finish(true); else finish(false, { code: e.code === 1 ? "DENIED" : e.code === 3 ? "TIMEOUT" : "UNAVAILABLE" }); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
      const t = setTimeout(() => (best ? finish(true) : finish(false, { code: "TIMEOUT" })), 16000);
    });
  }
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const GPS_MSG = {
    DENIED: isIOS ? "Não deste permissão de localização. No iPhone: Definições → Privacidade → Serviços de localização → Safari (ou a app YFX Gym) → \"Durante a utilização\"." : "Não deste permissão de localização. Toca no cadeado ao lado do endereço → Permissões → Localização → Permitir.",
    TIMEOUT: "O GPS demorou demasiado. Confirma que a localização está ligada e tenta outra vez perto de uma janela.",
    UNAVAILABLE: "A localização está desligada ou indisponível. Liga o GPS do telemóvel e tenta outra vez.",
    NOSUPPORT: "Este browser não dá a localização. Abre a app no Chrome ou no Safari.",
    INSECURE: "A localização só funciona no endereço seguro (https) da app.",
  };
  async function doCheckin() {
    if (!needOnline()) return;
    const btn = $("#btnCheckin"); busy(btn, true, "A confirmar localização…");
    let pos;
    try { pos = await bestPosition(); }
    catch (e) {
      busy(btn, false);
      sheet(`<div class="sheet-owl">${yofi("alerta", 72)}</div><h3>Sem localização</h3><p class="muted">${esc(GPS_MSG[e.code] || GPS_MSG.UNAVAILABLE)}</p><p class="muted small">O check-in só conta com a localização confirmada, para ser justo para todos.</p>
        <div class="stack"><button class="btn primary" id="sRetry">Tentar outra vez</button><button class="btn ghost" data-close>Fechar</button></div>`, (w) => $("#sRetry", w).addEventListener("click", () => { closeSheet(); setTimeout(doCheckin, 300); }));
      return;
    }
    if (pos.accuracy > 150) {
      busy(btn, false);
      sheet(`<div class="sheet-owl">${yofi("alerta", 72)}</div><h3>Localização pouco precisa</h3><p class="muted">O telemóvel só sabe onde estás com uma margem de ${Math.round(pos.accuracy)} m. Vai para perto de uma janela ou para a rua e tenta outra vez.</p>
        <div class="stack"><button class="btn primary" id="sRetry">Tentar outra vez</button><button class="btn ghost" data-close>Fechar</button></div>`, (w) => $("#sRetry", w).addEventListener("click", () => { closeSheet(); setTimeout(doCheckin, 300); }));
      return;
    }
    try {
      if (!S.gym?.saved) {
        busy(btn, false);
        sheet(`<div class="sheet-owl">${yofi("ola", 72)}</div><h3>Este é o teu ginásio?</h3><p class="muted">Guardo esta localização como o teu ginásio (só tu a vês). A partir daí confirmo que estás mesmo lá. Só podes mudá-la uma vez por semana.</p>
          <div class="stack"><button class="btn primary" id="sYes">Sim, guardar e fazer check-in</button><button class="btn ghost" data-close>Ainda não cheguei</button></div>`, (w) => {
          $("#sYes", w).addEventListener("click", async (e) => { if (!needOnline()) return; busy(e.currentTarget, true, "A guardar…"); try { const r = await store.setGymAndCheckIn(pos); closeSheet(); afterCheckin(r); } catch (er) { busy(e.currentTarget, false); toast(errMsg(er), "bad"); } });
        });
        return;
      }
      const r = await store.checkIn(pos);
      afterCheckin(r);
    } catch (e) {
      busy(btn, false);
      if (e.code === "TOO_FAR") {
        const d = e.distance || 0;
        sheet(`<div class="sheet-owl">${yofi("alerta", 72)}</div><h3>Estás a ${d >= 1000 ? kg(d / 1000) + " km" : d + " m"} do teu ginásio</h3><p class="muted">O check-in só conta no ginásio. Mudaste de ginásio? Podes guardar este sítio como o novo (uma vez por semana, e o grupo vê que mudaste).</p>
          <div class="stack"><button class="btn" id="sMove">Mudei de ginásio: guardar aqui</button><button class="btn ghost" data-close>Fechar</button></div>`, (w) => {
          $("#sMove", w).addEventListener("click", async (ev) => { if (!needOnline()) return; busy(ev.currentTarget, true, "A guardar…"); try { const r = await store.setGymAndCheckIn(pos); closeSheet(); afterCheckin(r); } catch (er) { busy(ev.currentTarget, false); toast(errMsg(er), "bad"); } });
        });
      } else toast(errMsg(e), "bad");
    }
  }
  async function afterCheckin(r) {
    if (r.status === "already") toast("Já tinhas feito check-in hoje.");
    else toast(r.goal_reached ? `Meta da semana cumprida! ${r.visits}/${r.target} 🦉` : `Check-in feito · ${r.visits}/${r.target} esta semana`, "good");
    await refresh(true);
    if (r.goal_reached) sheet(`<div class="sheet-owl">${yofi("celebra", 96)}</div><h3>Meta cumprida!</h3><p class="muted">${r.visits}/${r.target} idas esta semana. A Yofi aprova. Já está no feed.</p><div class="stack"><button class="btn primary" data-close>Boa!</button></div>`);
  }
  async function doWeighin(e) {
    e.preventDefault();
    const raw = String($("#wIn").value).trim().replace(",", ".");
    const v = Number(raw);
    if (!/^\d{2,3}(\.\d{1,2})?$/.test(raw) || !(v >= 30 && v <= 300)) { toast("Escreve o peso em kg, por exemplo 96,4.", "bad"); $("#wIn").focus(); return; }
    if (!needOnline()) return;
    const btn = e.submitter || $("#wForm button"); busy(btn, true, "A guardar…");
    try { S.weight = await store.logWeight(v); toast("Pesagem registada", "good"); await refresh(true); }
    catch (er) { toast(errMsg(er), "bad"); busy(btn, false); }
  }

  // ---------- FEED ----------
  const F = { posts: [], reacts: [], comms: [], open: new Set(), end: false, newer: false };
  async function vFeed() {
    $("#view").innerHTML = `
      <form class="card composer" id="cmp" novalidate>
        <div class="cmp-row">${avatar(store.profile, 38)}<label for="cmpTxt" class="sr">Mensagem para o grupo</label><textarea id="cmpTxt" rows="2" maxlength="1000" placeholder="Escreve algo ao grupo…"></textarea></div>
        <div id="cmpPrev"></div>
        <div class="row-between"><label class="btn ghost sm" for="cmpImg">Foto</label><input type="file" id="cmpImg" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" class="sr"><small class="muted" id="cmpCount" aria-live="polite"></small><button class="btn primary sm" type="submit">Publicar</button></div>
      </form>
      <button class="new-pill" id="newPill" hidden>Novas publicações · ver</button>
      <div id="posts" aria-live="polite"><div class="skeleton"></div><div class="skeleton"></div></div>
      <div class="center"><button class="btn ghost sm" id="more" hidden>Carregar mais</button></div>`;
    let photo = null;
    $("#cmpTxt").addEventListener("input", (e) => { const n = e.target.value.length; $("#cmpCount").textContent = n > 800 ? `${n}/1000` : ""; });
    $("#cmpImg").addEventListener("change", async (e) => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      try { photo = await shrink(f, 1280); $("#cmpPrev").innerHTML = `<div class="prev"><img src="${URL.createObjectURL(photo)}" alt="Pré-visualização da foto"><button type="button" class="x" aria-label="Remover foto">×</button></div>`; $("#cmpPrev .x").onclick = () => { photo = null; $("#cmpPrev").innerHTML = ""; }; }
      catch (er) { toast(er.message, "bad"); }
    });
    $("#cmp").addEventListener("submit", async (e) => {
      e.preventDefault(); const body = $("#cmpTxt").value.trim(); if (!body && !photo) { $("#cmpTxt").focus(); return; }
      if (!needOnline()) return;
      const b = e.submitter || $("#cmp button[type=submit]"); busy(b, true, photo ? "A enviar foto…" : "A publicar…");
      try { const path = photo ? await store.uploadPhoto(photo) : null; await store.addPost(body, path); $("#cmpTxt").value = ""; $("#cmpCount").textContent = ""; photo = null; $("#cmpPrev").innerHTML = ""; await loadPosts(true); }
      catch (er) { toast(errMsg(er), "bad"); }
      busy(b, false);
    });
    $("#more").addEventListener("click", async (e) => { busy(e.currentTarget, true, "A carregar…"); await loadPosts(false); });
    $("#newPill").addEventListener("click", () => { F.newer = false; loadPosts(true); window.scrollTo({ top: 0, behavior: "smooth" }); });
    await loadPosts(true);
  }
  async function loadPosts(reset) {
    const box = $("#posts"); if (!box) return;
    try {
      const before = reset ? null : F.posts[F.posts.length - 1]?.created_at;
      const page = await store.posts(20, before);
      const ids = page.map((p) => p.id);
      const [rs, cs] = await Promise.all([store.reactions(ids), store.comments(ids)]);
      if (reset) { F.posts = page; F.reacts = rs; F.comms = cs; } else { F.posts = F.posts.concat(page); F.reacts = F.reacts.concat(rs); F.comms = F.comms.concat(cs); }
      F.end = page.length < 20; F.newer = false;
      S.urls = Object.assign(S.urls || {}, await store.signedUrls(F.posts.map((p) => p.photo_path)));
      drawPosts();
    } catch (e) {
      if (!F.posts.length) box.innerHTML = `<div class="empty">${yofi("alerta", 72)}<p>${esc(errMsg(e))}</p><button class="btn sm" id="retryFeed">Tentar outra vez</button></div>`;
      $("#retryFeed")?.addEventListener("click", () => loadPosts(true));
      toast(errMsg(e), "bad");
    }
    const m = $("#more"); if (m) { busy(m, false); m.hidden = F.end || !F.posts.length; }
    const np = $("#newPill"); if (np) np.hidden = !F.newer;
  }
  function drawPosts() {
    const box = $("#posts"); if (!box) return;
    if (!F.posts.length) { box.innerHTML = `<div class="empty">${yofi("ola", 80)}<p>O feed está vazio. Faz o primeiro check-in ou escreve algo ao grupo.</p></div>`; return; }
    box.innerHTML = F.posts.map((p) => postCard(p, F.reacts.filter((r) => r.post_id === p.id), F.comms.filter((c) => c.post_id === p.id))).join("");
  }
  function postBody(p) {
    const m = p.meta || {};
    switch (p.kind) {
      case "checkin": return m.moved ? `<p class="act">📍 mudou de ginásio <span class="chip">o grupo foi avisado</span></p>` : `<p class="act">📍 fez check-in no ginásio <span class="chip good">GPS confirmado</span></p>`;
      case "workout": return `<p class="act">🏋️ terminou o treino <b>${esc(m.title)}</b></p><div class="chips"><span class="chip">${num(m.n_ex)} ${num(m.n_ex) === 1 ? "exercício" : "exercícios"}</span><span class="chip">${num(m.n_sets)} ${num(m.n_sets) === 1 ? "série" : "séries"}</span><span class="chip">${kg(m.volume, 0)} kg de volume</span></div>${(Array.isArray(m.prs) ? m.prs : []).map((r) => `<div class="pr">🏆 Novo recorde: <b>${esc(r.ex)}</b> ${kg(r.kg)} kg × ${num(r.reps)}</div>`).join("")}`;
      case "weighin": { const r = ["cumpriu", "perto", "falhou"].includes(m.result) ? m.result : ""; return m.first ? `<p class="act">⚖️ começou a acompanhar o peso · meta: ${esc(goalLabel(m.goal))}</p>` : `<p class="act">⚖️ pesagem semanal: <b>${signed(num(m.delta))} kg</b> ${r ? `<span class="chip ${r}">${{ cumpriu: "meta cumprida ✓", perto: "quase lá", falhou: "meta falhada" }[r]}</span>` : ""}</p><small class="muted">Meta: ${esc(goalLabel(m.goal))}</small>`; }
      case "goal": return `<p class="act">🎯 cumpriu a meta da semana · <b>${num(m.visits)}/${num(m.target)} idas</b></p>`;
      default: return `${p.body ? `<p class="txt">${esc(p.body)}</p>` : ""}${p.photo_path ? (S.urls[p.photo_path] ? `<img class="ph" src="${esc(S.urls[p.photo_path])}" alt="Foto publicada por ${esc(S.byId[p.user_id]?.name || "um membro")}" loading="lazy" decoding="async">` : `<div class="ph ph-missing">Foto indisponível sem rede</div>`) : ""}`;
    }
  }
  function postCard(p, rs, cs) {
    const u = S.byId[p.user_id] || { name: "Ex-membro", color: "#64748b" };
    const open = F.open.has(p.id), mine = p.user_id === store.uid && (p.kind === "text" || p.kind === "photo");
    return `<article class="post card ${open ? "open" : ""} k-${esc(p.kind)}" data-id="${esc(p.id)}">
      <header>${avatar(u)}<div class="who"><b>${esc(u.name)}</b><small><time datetime="${esc(p.created_at)}">${ago(p.created_at)}</time></small></div>${mine ? `<button class="link del" data-del="${esc(p.id)}" aria-label="Apagar publicação">Apagar</button>` : ""}</header>
      ${postBody(p)}
      <div class="reacts">${EMOJIS.map(([e, label]) => { const n = rs.filter((r) => r.emoji === e).length, my = rs.some((r) => r.emoji === e && r.user_id === store.uid); return `<button class="react ${my ? "mine" : ""}" data-p="${esc(p.id)}" data-e="${e}" aria-pressed="${my}" aria-label="Reagir com ${label}${n ? `, ${n}` : ""}"><span aria-hidden="true">${e}</span><i>${n || ""}</i></button>`; }).join("")}
        <button class="cm-toggle" data-p="${esc(p.id)}" aria-expanded="${open}">${cs.length ? `${cs.length} ${cs.length === 1 ? "comentário" : "comentários"}` : "Comentar"}</button></div>
      <div class="cms">${cs.map((c) => { const cu = S.byId[c.user_id] || { name: "Ex-membro" }; return `<div class="cm">${avatar(cu, 28)}<p><b>${esc(cu.name)}</b> ${esc(c.body)}</p>${c.user_id === store.uid ? `<button class="x sm" data-delc="${esc(c.id)}" aria-label="Apagar comentário">×</button>` : ""}</div>`; }).join("")}
        <form class="cm-form" data-p="${esc(p.id)}" novalidate><label class="sr" for="c${esc(p.id)}">Comentário</label><input id="c${esc(p.id)}" maxlength="500" placeholder="Escreve um comentário…" enterkeyhint="send"><button class="btn sm">Enviar</button></form></div>
    </article>`;
  }
  // delegação de eventos do feed (um só listener)
  document.addEventListener("click", async (e) => {
    const box = e.target.closest("#posts"); if (!box) return;
    const r = e.target.closest(".react");
    if (r) {
      if (!needOnline()) return;
      const on = !r.classList.contains("mine"); const i = r.querySelector("i"); const n0 = parseInt(i.textContent) || 0;
      r.classList.toggle("mine", on); r.setAttribute("aria-pressed", on); i.textContent = Math.max(0, n0 + (on ? 1 : -1)) || ""; r.disabled = true;
      try { await store.toggleReaction(r.dataset.p, r.dataset.e, on); if (on) F.reacts.push({ post_id: r.dataset.p, user_id: store.uid, emoji: r.dataset.e }); else F.reacts = F.reacts.filter((x) => !(x.post_id === r.dataset.p && x.user_id === store.uid && x.emoji === r.dataset.e)); }
      catch (er) { r.classList.toggle("mine", !on); r.setAttribute("aria-pressed", !on); i.textContent = n0 || ""; toast(errMsg(er), "bad"); }
      r.disabled = false; return;
    }
    const t = e.target.closest(".cm-toggle");
    if (t) { const id = t.dataset.p; const post = t.closest(".post"); const open = !post.classList.contains("open"); post.classList.toggle("open", open); t.setAttribute("aria-expanded", open); open ? F.open.add(id) : F.open.delete(id); if (open) post.querySelector(".cm-form input")?.focus(); return; }
    const d = e.target.closest("[data-del]");
    if (d) { if (!needOnline()) return; if (!(await confirmSheet("Apagar esta publicação?", "Os comentários e reações também desaparecem.", "Apagar", true))) return; try { await store.deletePost(d.dataset.del); F.posts = F.posts.filter((p) => p.id !== d.dataset.del); drawPosts(); toast("Publicação apagada"); } catch (er) { toast(errMsg(er), "bad"); } return; }
    const dc = e.target.closest("[data-delc]");
    if (dc) { if (!needOnline()) return; try { await store.deleteComment(dc.dataset.delc); F.comms = F.comms.filter((c) => c.id !== dc.dataset.delc); drawPosts(); } catch (er) { toast(errMsg(er), "bad"); } }
  });
  document.addEventListener("submit", async (e) => {
    const f = e.target.closest(".cm-form"); if (!f) return;
    e.preventDefault(); const i = f.querySelector("input"); const t = i.value.trim(); if (!t) return;
    if (!needOnline()) return;
    i.disabled = true; f.querySelector("button").disabled = true;
    try { await store.addComment(f.dataset.p, t); F.open.add(f.dataset.p); F.comms = F.comms.concat(await store.comments([f.dataset.p])).filter((c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx); drawPosts(); $(`#c${CSS.escape(f.dataset.p)}`)?.focus(); }
    catch (er) { toast(errMsg(er), "bad"); i.disabled = false; f.querySelector("button").disabled = false; }
  });

  // fotos: valida pelo conteúdo (descodifica), corrige orientação, reduz e comprime
  async function shrink(file, max) {
    if (file.size > 25 * 1024 * 1024) throw new Error("A foto é demasiado grande (máx. 25 MB).");
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) {
      bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Este ficheiro não é uma imagem que o telemóvel consiga abrir (usa JPG ou PNG).")); i.src = URL.createObjectURL(file); });
    }
    const w0 = bmp.width, h0 = bmp.height; if (!w0 || !h0) throw new Error("Imagem inválida.");
    const s = Math.min(1, max / Math.max(w0, h0));
    const c = document.createElement("canvas"); c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    let q = 0.82, blob;
    do { blob = await new Promise((res) => c.toBlob(res, "image/jpeg", q)); q -= 0.12; } while (blob && blob.size > 1.5 * 1024 * 1024 && q > 0.4);
    if (!blob) throw new Error("Não consegui preparar a foto.");
    return blob;
  }

  // ---------- TREINO ----------
  const DKEY = () => "yfxgym-draft-" + store.uid;
  const getDraft = () => { try { return JSON.parse(localStorage.getItem(DKEY())); } catch (e) { return S._draft || null; } };
  const setDraft = (d) => { S._draft = d; try { d ? localStorage.setItem(DKEY(), JSON.stringify(d)) : localStorage.removeItem(DKEY()); } catch (e) {} };
  const exType = (n) => (EXERCISES.find((e) => e.n === n) || { t: "w" }).t;
  const T = { hist: [], end: false, bests: {} };

  async function vTreino() {
    const d = getDraft();
    if (d) return vDraft(d);
    $("#view").innerHTML = `
      <section class="card start">
        <div class="row-gap">${yofi("normal", 64)}<div><h2>Treino de hoje</h2><p class="muted">Regista séries, repetições e carga. O treino fica guardado no telemóvel até carregares em "Terminar", mesmo que feches a app.</p></div></div>
        <button class="btn primary big" id="startW">Começar treino</button>
      </section>
      <section class="card"><span class="eyebrow">As tuas melhores marcas</span><div class="big3" id="big3">${BIG3.map((b) => `<div><small>${esc(b.replace(" (barra)", ""))}</small><b>…</b></div>`).join("")}</div></section>
      <section><h3 class="sec">Histórico</h3><div id="hist"><div class="skeleton sm"></div></div><div class="center"><button class="btn ghost sm" id="moreW" hidden>Ver mais</button></div></section>`;
    $("#startW").addEventListener("click", () => { const nd = { id: uuid(), title: "Treino de " + DIAS_NOME[(num(S.weight?.weekday, 1) + 6) % 7], startedAt: Date.now(), items: [] }; setDraft(nd); vDraft(nd); openPicker(); });
    $("#moreW").addEventListener("click", () => loadHist(false));
    try {
      const bests = await store.myBests(BIG3); T.bests = Object.fromEntries(bests.map((b) => [b.ex, b]));
      const box = $("#big3"); if (box) box.innerHTML = BIG3.map((b) => `<div><small>${esc(b.replace(" (barra)", ""))}</small><b>${T.bests[b] ? kg(T.bests[b].kg) + "<i>kg</i>" : "—"}</b></div>`).join("");
    } catch (e) {}
    loadHist(true);
  }
  async function loadHist(reset) {
    const box = $("#hist"); if (!box) return;
    try {
      const page = await store.myWorkouts(10, reset ? null : T.hist[T.hist.length - 1]?.created_at);
      T.hist = reset ? page : T.hist.concat(page); T.end = page.length < 10;
      box.innerHTML = T.hist.length ? T.hist.map((w) => `<div class="card hist"><div class="row-between"><b>${esc(w.title)}</b><small class="muted">${ago(w.created_at)}</small></div><small class="muted">${new Set((w.sets || []).map((s) => s.ex)).size} exerc. · ${(w.sets || []).length} séries · ${kg(w.volume, 0)} kg</small>${(w.prs || []).map((r) => `<div class="pr">🏆 ${esc(r.ex)} ${kg(r.kg)} kg × ${num(r.reps)}</div>`).join("")}</div>`).join("") : `<div class="empty small">${yofi("ola", 56)}<p>Ainda não registaste nenhum treino. O primeiro é sempre o mais difícil.</p></div>`;
    } catch (e) { box.innerHTML = `<p class="muted">${esc(errMsg(e))}</p>`; }
    const m = $("#moreW"); if (m) m.hidden = T.end;
  }
  function vDraft(d) {
    const mins = Math.max(0, Math.floor((Date.now() - d.startedAt) / 60000));
    $("#view").innerHTML = `
      <section class="card">
        <div class="row-between"><span class="eyebrow">Em curso · ${mins} min · guardado no telemóvel</span><button class="link" id="cancelW">Descartar</button></div>
        <label class="sr" for="wTitle">Nome do treino</label><input id="wTitle" class="title-in" value="${esc(d.title)}" maxlength="60">
      </section>
      <div id="items">${d.items.length ? d.items.map((it, i) => itemCard(it, i)).join("") : `<div class="empty small">${yofi("normal", 56)}<p>Adiciona o primeiro exercício.</p></div>`}</div>
      <button class="btn ghost wide" id="addEx">+ Adicionar exercício</button>
      <button class="btn primary big" id="finishW" ${d.items.length ? "" : "disabled"}>Terminar e publicar</button>`;
    $("#wTitle").addEventListener("input", (e) => { d.title = e.target.value; setDraft(d); });
    $("#addEx").addEventListener("click", openPicker);
    $("#cancelW").addEventListener("click", async () => { if (await confirmSheet("Descartar este treino?", "As séries registadas perdem-se.", "Descartar treino", true)) { setDraft(null); vTreino(); } });
    $("#finishW").addEventListener("click", finishWorkout);
    const box = $("#items");
    box.addEventListener("input", (e) => {
      const t = e.target; if (!t.dataset.f) return;
      const s = d.items[t.dataset.i].sets[t.dataset.s];
      let v = String(t.value).replace(",", ".").replace(/[^\d.]/g, "");
      if (t.dataset.f === "reps") v = v.replace(/\..*/, "").slice(0, 4); else v = v.replace(/^(\d{0,4})(\.\d{0,2})?.*$/, "$1$2");
      if (t.value !== v) t.value = v;
      s[t.dataset.f] = v === "" ? null : Number(v);
      const bad = t.dataset.f === "reps" ? !(s.reps >= 1 && s.reps <= 1000) : !(s.kg == null || (s.kg >= 0 && s.kg <= 1000));
      t.classList.toggle("bad", bad && v !== ""); setDraft(d);
    });
    box.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-a]"); if (!b) return; const i = +b.dataset.i;
      if (b.dataset.a === "add") { if (d.items[i].sets.length >= 20) return toast("Máximo de 20 séries por exercício."); const last = d.items[i].sets.slice(-1)[0] || { reps: 10, kg: 0 }; d.items[i].sets.push({ reps: last.reps, kg: last.kg }); }
      if (b.dataset.a === "del") { d.items[i].sets.splice(+b.dataset.s, 1); if (!d.items[i].sets.length) d.items.splice(i, 1); }
      if (b.dataset.a === "rm") d.items.splice(i, 1);
      setDraft(d); vDraft(d);
      if (b.dataset.a === "add") $$(`#items input[data-i="${i}"][data-f="reps"]`).pop()?.focus();
    });
  }
  function itemCard(it, i) {
    const t = exType(it.ex), lr = t === "time" ? "min" : "reps", lk = t === "w" ? "kg" : t === "bw" ? "kg extra" : "";
    return `<section class="card item"><div class="row-between"><b>${esc(it.ex)}</b><button class="link" data-a="rm" data-i="${i}" aria-label="Remover ${esc(it.ex)}">Remover</button></div>
      <div class="sets"><div class="set head" aria-hidden="true"><span>Série</span><span>${lr}</span>${lk ? `<span>${lk}</span>` : "<span></span>"}<span></span></div>
      ${it.sets.map((s, j) => `<div class="set"><span class="n">${j + 1}</span><input inputmode="numeric" pattern="[0-9]*" aria-label="${lr}, série ${j + 1}" data-i="${i}" data-s="${j}" data-f="reps" value="${s.reps ?? ""}">${lk ? `<input inputmode="decimal" aria-label="${lk}, série ${j + 1}" data-i="${i}" data-s="${j}" data-f="kg" value="${s.kg ?? ""}" placeholder="0">` : "<span></span>"}<button class="x" data-a="del" data-i="${i}" data-s="${j}" aria-label="Apagar série ${j + 1}">×</button></div>`).join("")}</div>
      <button class="btn ghost sm" data-a="add" data-i="${i}">+ Série</button></section>`;
  }
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  function openPicker() {
    const groups = [...new Set(EXERCISES.map((e) => e.g))];
    sheet(`<h3>Adicionar exercício</h3><label class="sr" for="exQ">Procurar exercício</label><input id="exQ" type="search" placeholder="Procurar (ex. supino)" autocomplete="off" enterkeyhint="search">
      <div class="ex-list" id="exList"></div>`, (w) => {
      const draw = (q) => {
        const qq = norm(q.trim()), d = getDraft(), inDraft = new Set(d.items.map((x) => x.ex));
        let html = groups.map((g) => { const xs = EXERCISES.filter((e) => e.g === g && norm(e.n).includes(qq)); return xs.length ? `<h4>${g}</h4>${xs.map((e) => `<button class="ex ${inDraft.has(e.n) ? "added" : ""}" data-n="${esc(e.n)}">${esc(e.n)}${inDraft.has(e.n) ? " · já no treino" : ""}</button>`).join("")}` : ""; }).join("");
        const custom = q.trim().slice(0, 60);
        if (qq.length >= 3 && !EXERCISES.some((e) => norm(e.n) === qq)) html += `<button class="ex custom" data-n="${esc(custom)}">+ Usar "${esc(custom)}"</button>`;
        $("#exList", w).innerHTML = html || `<p class="muted">Nada encontrado.</p>`;
      };
      draw(""); $("#exQ", w).addEventListener("input", (e) => draw(e.target.value));
      $("#exList", w).addEventListener("click", (e) => {
        const b = e.target.closest(".ex"); if (!b) return; const d = getDraft(); const n = b.dataset.n.trim(); if (!n) return;
        const idx = d.items.findIndex((x) => x.ex === n);
        if (idx >= 0) { closeSheet(); vDraft(d); toast("Esse exercício já está no treino."); $$(`#items .item`)[idx]?.scrollIntoView({ block: "center" }); return; }
        if (d.items.length >= 30) { toast("Máximo de 30 exercícios por treino."); return; }
        d.items.push({ ex: n, sets: [{ reps: exType(n) === "time" ? 20 : 10, kg: null }] }); setDraft(d); closeSheet(); vDraft(d);
        $$(`#items input[data-i="${d.items.length - 1}"]`)[0]?.focus();
      });
    });
  }
  let finishing = false;
  async function finishWorkout() {
    if (finishing) return;
    const d = getDraft(); if (!d) return;
    if (!d.id) { d.id = uuid(); setDraft(d); }
    const sets = d.items.flatMap((it) => it.sets.filter((s) => num(s.reps) >= 1).map((s) => ({ ex: it.ex, reps: Math.round(num(s.reps)), kg: Math.round(num(s.kg) * 100) / 100 })));
    const bad = sets.some((s) => s.reps > 1000 || s.kg < 0 || s.kg > 1000);
    if (!sets.length) { toast("Regista pelo menos uma série com repetições.", "bad"); return; }
    if (bad) { toast("Há valores fora do normal (reps até 1000, carga até 1000 kg). Corrige os campos a vermelho.", "bad"); return; }
    if (!needOnline()) return;
    finishing = true;
    const btn = $("#finishW"); busy(btn, true, "A guardar…");
    try {
      const r = await store.finishWorkout(d.id, (d.title || "Treino").trim().slice(0, 60), sets);
      setDraft(null); refresh(true);
      const prs = Array.isArray(r.prs) ? r.prs : [];
      sheet(`<div class="sheet-owl">${yofi("celebra", 88)}</div><h3>${prs.length ? `${prs.length} ${prs.length === 1 ? "recorde novo" : "recordes novos"}!` : "Treino guardado"}</h3>
        <p class="muted">${num(r.n_sets)} séries · ${kg(r.volume, 0)} kg de volume. Já está no feed do grupo.</p>${prs.map((x) => `<div class="pr">🏆 ${esc(x.ex)} ${kg(x.kg)} kg × ${num(x.reps)}</div>`).join("")}
        <div class="stack"><button class="btn primary" id="sFeed">Ver no feed</button><button class="btn ghost" data-close>Fechar</button></div>`, (wr) => $("#sFeed", wr).addEventListener("click", () => { closeSheet(); go("feed"); }));
      vTreino();
    } catch (e) { toast(errMsg(e) + (e.code === "OFFLINE" ? "" : " O treino continua guardado no telemóvel."), "bad"); busy(btn, false); }
    finishing = false;
  }

  // ---------- RANKING ----------
  async function vRanking() {
    $("#view").innerHTML = `<div class="seg" role="tablist" aria-label="Semana"><button role="tab" data-w="0" aria-selected="${S.rankWeeks === 0}" class="${S.rankWeeks === 0 ? "on" : ""}">Esta semana</button><button role="tab" data-w="1" aria-selected="${S.rankWeeks === 1}" class="${S.rankWeeks === 1 ? "on" : ""}">Semana passada</button></div><div id="rk"><div class="skeleton"></div></div>`;
    $$(".seg button").forEach((b) => b.addEventListener("click", () => { S.rankWeeks = +b.dataset.w; vRanking(); }));
    let r = S.rank;
    try { if (S.rankWeeks) r = await store.ranking(S.rankWeeks); } catch (e) { $("#rk").innerHTML = `<p class="muted">${esc(errMsg(e))}</p>`; return; }
    const ws = r[0]?.week_start || S.ws, we = addDays(ws, 6), cur = S.rankWeeks === 0;
    const lead = r[0], last = r[r.length - 1];
    let bests = [];
    try { bests = await store.groupBests(BIG3); } catch (e) {}
    const medal = ["🥇", "🥈", "🥉"];
    const everyone100 = r.length > 1 && r.every((x) => x.pct === 100);
    $("#rk").innerHTML = `
      <section class="card vigia small">
        <div class="vigia-owl">${yofi(everyone100 || (lead && lead.pct === 100) ? "celebra" : "alerta", 60)}</div>
        <div class="bubble"><span class="eyebrow">${cur ? "Esta semana" : "Semana passada"} · ${shortDate(ws)} a ${shortDate(we)}</span>
          <p>${everyone100 ? "Semana perfeita: o grupo todo a 100%! 🦉" : lead && lead.visits ? `${esc(firstName(lead.name))} ${cur ? "vai à frente" : "ganhou"} com ${lead.pct}% da meta.` : cur ? "Ninguém fez check-in esta semana. Quem abre?" : "Semana fraca: ninguém fez check-in."}${!everyone100 && last && r.length > 1 && last.user_id !== lead.user_id ? ` ${esc(firstName(last.name))}, estou de olho em ti 👀` : ""}</p></div>
      </section>
      <ol class="rank">${r.map((x, i) => `<li class="card ${x.user_id === store.uid ? "me" : ""}">
        <span class="pos" aria-label="${i + 1}.º lugar">${medal[i] || i + 1}</span>${avatar(x, 42)}
        <div class="rk-main"><div class="row-between"><b class="name">${esc(x.name)}${x.user_id === store.uid ? " <small>(tu)</small>" : ""}</b><b class="pct">${x.pct}%</b></div>
          <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${x.pct}" aria-label="Meta de ${esc(x.name)}"><span style="width:${x.pct}%"></span></div>
          <small class="muted">${x.visits}/${x.target} idas · ${x.workouts} ${x.workouts === 1 ? "treino" : "treinos"}${x.weight_delta != null && num(x.weight_delta) !== 0 ? ` · ${signed(num(x.weight_delta))} kg` : ""}</small></div></li>`).join("")}</ol>
      <p class="muted note">Conta a % da meta de cada um (máximo 100%), calculada no servidor. Empate: mais idas, depois mais volume de treino. A meta da semana fica fixa na segunda-feira.</p>
      <section class="card">
        <span class="eyebrow">Melhores marcas do grupo</span>
        <div class="b3t">${BIG3.map((b) => { const t = bests.find((x) => x.ex === b); const u = t && (S.byId[t.user_id] || { name: "Ex-membro" }); return `<div class="row-between"><span>${esc(b.replace(" (barra)", ""))}</span>${t ? `<span class="who-best">${avatar(u, 24)} <b>${kg(t.kg)} kg</b> <small class="muted">${esc(firstName(u.name))}</small></span>` : `<small class="muted">sem marcas</small>`}</div>`; }).join("")}</div>
      </section>`;
  }

  // ---------- PERFIL ----------
  const COLORS = ["#22d3ee", "#3b82f6", "#34d399", "#f472b6", "#fbbf24", "#a78bfa"];
  const GOALS = [[-1, "Perder 1 kg por semana"], [-0.5, "Perder 0,5 kg por semana"], [0, "Manter o peso"], [0.25, "Ganhar 0,25 kg por semana"], [0.5, "Ganhar 0,5 kg por semana"]];
  async function vPerfil() {
    const p = store.profile, g = S.group, owner = g.created_by === store.uid;
    const link = location.origin + location.pathname + "?c=" + encodeURIComponent(g.invite_code);
    let wt = null; try { wt = await store.myWeekTarget(); } catch (e) {}
    const canChange = S.gym?.can_change_at ? new Date(S.gym.can_change_at) : null;
    $("#view").innerHTML = `
      <section class="card prof-head">${avatar(p, 64)}<div class="who"><h2>${esc(p.name)}</h2><small class="muted">${esc(g.name)} · ${S.members.length} ${S.members.length === 1 ? "membro" : "membros"}</small></div>
        <div class="av-actions"><label class="btn ghost sm" for="avIn">Foto</label><input type="file" id="avIn" accept="image/*" class="sr">${p.avatar_path ? `<button class="link" id="avRm">Remover</button>` : ""}</div></section>
      <form class="card form" id="pf" novalidate>
        <label for="pName">Nome</label><input id="pName" value="${esc(p.name)}" maxlength="30" required autocomplete="nickname">
        <span class="lbl" id="colorLbl">Cor</span><div class="swatches" role="radiogroup" aria-labelledby="colorLbl">${COLORS.map((c, i) => `<label class="sw" style="--c:${c}"><input type="radio" name="pColor" value="${c}" ${p.color === c ? "checked" : ""}><span class="sr">Cor ${i + 1}</span></label>`).join("")}</div>
        <span class="lbl" id="visLbl">Idas ao ginásio por semana</span>
        <div class="stepper" role="group" aria-labelledby="visLbl"><button type="button" data-d="-1" aria-label="Menos uma ida">−</button><output id="pVisOut" aria-live="polite">${p.visits_target}</output><input type="hidden" id="pVis" value="${p.visits_target}"><button type="button" data-d="1" aria-label="Mais uma ida">+</button></div>
        <label for="pGoal">Meta de peso</label>
        <select id="pGoal">${GOALS.map(([v, l]) => `<option value="${v}" ${num(p.weight_goal_kg) === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        ${wt && wt.frozen && (wt.visits_target !== p.visits_target || num(wt.weight_goal_kg) !== num(p.weight_goal_kg)) ? `<p class="note-box">Esta semana conta a meta fixada na segunda (${wt.visits_target} idas, ${esc(goalLabel(wt.weight_goal_kg))}). A nova meta conta a partir da próxima segunda.</p>` : `<small class="muted">Mudanças de meta contam a partir da próxima segunda-feira.</small>`}
        <button class="btn primary" type="submit">Guardar</button>
      </form>
      <section class="card">
        <span class="eyebrow">Convidar amigos</span>
        <p class="muted">Só entra no grupo quem tiver este código.</p>
        <div class="code"><b id="code" aria-label="Código de convite">${esc(g.invite_code)}</b><button class="btn sm" id="share">Partilhar convite</button></div>
        <small class="muted sel">${esc(link)}</small>
        ${owner ? `<button class="link" id="rotate">Gerar código novo (o antigo deixa de funcionar)</button>` : ""}
      </section>
      <section class="card">
        <span class="eyebrow">Membros</span>
        <ul class="members">${S.members.map((m) => `<li>${avatar(m, 32)}<span class="name">${esc(m.name)}${m.id === g.created_by ? ' <small class="muted">· criou o grupo</small>' : ""}</span>${owner && m.id !== store.uid ? `<button class="link" data-rm="${esc(m.id)}" data-name="${esc(m.name)}">Remover</button>` : ""}</li>`).join("")}</ul>
      </section>
      <section class="card">
        <span class="eyebrow">O meu ginásio</span>
        <p class="muted">${S.gym?.saved ? `Localização guardada (só tu a tens). O check-in confirma que estás a menos de 250 m.${canChange && canChange > new Date() ? ` Podes mudar de ginásio a partir de ${canChange.toLocaleDateString("pt-PT", { day: "numeric", month: "long", timeZone: S.tz })}.` : " Se mudares de ginásio, o check-in oferece-te guardar o novo sítio."}` : "Ainda não guardado. Fica guardado no teu primeiro check-in."}</p>
      </section>
      <section class="stack"><button class="btn ghost" id="logout">Terminar sessão</button><button class="btn danger" id="leave">Sair do grupo</button></section>
      <div class="sign">${yofi("ola", 56)}<p>YFX Gym · Versão 1<br><small>powered by YFX · Maputo</small></p></div>`;
    $$(".stepper button").forEach((b) => b.addEventListener("click", () => { const i = $("#pVis"); const v = Math.max(2, Math.min(7, +i.value + +b.dataset.d)); i.value = v; $("#pVisOut").textContent = v; }));
    $("#pf").addEventListener("submit", async (e) => {
      e.preventDefault(); const name = $("#pName").value.trim();
      if (name.length < 1) { toast("Escreve o teu nome.", "bad"); return; }
      if (!needOnline()) return;
      const b = e.submitter || $("#pf button[type=submit]"); busy(b, true, "A guardar…");
      try { await store.updateProfile({ name, color: ($("input[name=pColor]:checked") || {}).value || p.color, visits_target: +$("#pVis").value, weight_goal_kg: +$("#pGoal").value }); toast("Perfil guardado", "good"); await refresh(true); }
      catch (er) { toast(errMsg(er), "bad"); busy(b, false); }
    });
    $("#avIn").addEventListener("change", async (e) => {
      const f = e.target.files[0]; e.target.value = ""; if (!f || !needOnline()) return;
      try { const blob = await shrink(f, 320); const path = await store.uploadPhoto(blob, "avatar"); await store.setAvatar(path); toast("Foto atualizada", "good"); await refresh(true); }
      catch (er) { toast(errMsg(er), "bad"); }
    });
    $("#avRm")?.addEventListener("click", async () => { if (!needOnline()) return; try { await store.setAvatar(null); await refresh(true); } catch (er) { toast(errMsg(er), "bad"); } });
    $("#share").addEventListener("click", async () => {
      const text = `Entra no nosso grupo "${g.name}" no YFX Gym. Código: ${g.invite_code}\n${link}`;
      try { if (navigator.share) { await navigator.share({ title: "YFX Gym", text }); return; } } catch (er) { if (er.name === "AbortError") return; }
      try { await navigator.clipboard.writeText(text); toast("Convite copiado. Cola no WhatsApp do grupo.", "good"); } catch (er) { const r = document.createRange(); r.selectNodeContents($(".sel")); getSelection().removeAllRanges(); getSelection().addRange(r); toast("Copia o link selecionado."); }
    });
    $("#rotate")?.addEventListener("click", async () => { if (!needOnline()) return; if (!(await confirmSheet("Gerar código novo?", "O código atual deixa de funcionar. Quem já está no grupo continua.", "Gerar código novo"))) return; try { await store.rotateInvite(); await refresh(true); toast("Código novo gerado", "good"); } catch (er) { toast(errMsg(er), "bad"); } });
    $$("[data-rm]").forEach((b) => b.addEventListener("click", async () => { if (!needOnline()) return; if (!(await confirmSheet(`Remover ${b.dataset.name}?`, "Deixa de ver o grupo. As publicações antigas ficam.", "Remover", true))) return; try { await store.removeMember(b.dataset.rm); await refresh(true); toast("Membro removido"); } catch (er) { toast(errMsg(er), "bad"); } }));
    $("#logout").addEventListener("click", async () => { await signOutClean(); });
    $("#leave").addEventListener("click", async () => { if (!needOnline()) return; if (!(await confirmSheet("Sair do grupo?", "Deixas de ver o feed e o ranking. Para voltar precisas de um código de convite.", "Sair do grupo", true))) return; try { await store.leaveGroup(); store.unsubscribe(); vGroupSetup(); } catch (er) { toast(errMsg(er), "bad"); } });
  }
  async function signOutClean() {
    store.unsubscribe();
    try { localStorage.removeItem(cacheKey()); } catch (e) {}
    await store.signOut();
    location.replace(location.pathname);
  }

  // ---------- ENTRADA ----------
  function authShell(inner) {
    document.body.classList.remove("in-app");
    $("#app").innerHTML = `<main class="auth">${inner}<footer class="powered static">powered by <b>YFX</b></footer></main>`;
    $("#reloadBtn")?.addEventListener("click", () => location.reload());
  }
  function vAuth(mode = "in", note = "") {
    authShell(`<div class="auth-owl">${yofi("ola", 112)}</div>
      <h1 class="wordmark big">YFX <b>GYM</b></h1>
      <p class="muted center">O ginásio do teu grupo de amigos. A Yofi vigia, vocês competem.</p>
      ${note ? `<div class="note-box" role="status">${esc(note)}</div>` : ""}
      <div class="seg" role="tablist"><button role="tab" aria-selected="${mode === "in"}" class="${mode === "in" ? "on" : ""}" data-m="in">Entrar</button><button role="tab" aria-selected="${mode === "up"}" class="${mode === "up" ? "on" : ""}" data-m="up">Criar conta</button></div>
      <form class="card form" id="af" novalidate>
        ${mode === "up" ? `<label for="aName">O teu nome</label><input id="aName" maxlength="30" autocomplete="given-name" required>` : ""}
        <label for="aEmail">Email</label><input id="aEmail" type="email" autocomplete="email" inputmode="email" required>
        <label for="aPw">Palavra-passe</label><input id="aPw" type="password" minlength="6" autocomplete="${mode === "up" ? "new-password" : "current-password"}" required>
        <button class="btn primary" type="submit">${mode === "up" ? "Criar conta" : "Entrar"}</button>
      </form>`);
    $$(".seg button").forEach((b) => b.addEventListener("click", () => vAuth(b.dataset.m)));
    $("#af").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#aEmail").value.trim(), pw = $("#aPw").value, name = $("#aName")?.value.trim();
      if (mode === "up" && !name) return toast("Escreve o teu nome.", "bad");
      if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Escreve um email válido.", "bad");
      if (pw.length < 6) return toast("A palavra-passe precisa de pelo menos 6 caracteres.", "bad");
      if (!needOnline()) return;
      const b = e.submitter || $("#af button[type=submit]"); busy(b, true, "Aguarda…");
      try {
        if (mode === "up") { const r = await store.signUp(email, pw, name); if (r === "confirm") return vAuth("in", `Enviámos um email de confirmação para ${email}. Confirma e depois entra aqui.`); }
        else await store.signIn(email, pw);
        await afterLogin();
      } catch (er) { toast(errMsg(er), "bad"); busy(b, false); }
    });
  }
  function vGroupSetup() {
    const code = (new URLSearchParams(location.search).get("c") || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
    authShell(`<div class="auth-owl">${yofi("normal", 96)}</div>
      <h1 class="wordmark big">Olá, ${esc(firstName(store.profile?.name))}</h1>
      <p class="muted center">Entra no grupo dos teus amigos com o código de convite, ou cria um grupo novo.</p>
      <form class="card form" id="jf" novalidate><label for="jCode">Código de convite</label><input id="jCode" value="${esc(code)}" autocapitalize="characters" autocomplete="off" maxlength="12" required><button class="btn primary" type="submit">Entrar no grupo</button></form>
      <div class="or">ou</div>
      <form class="card form" id="cf" novalidate><label for="cName">Nome do grupo</label><input id="cName" maxlength="40" placeholder="Ex.: Os Monstros do Ferro" required><button class="btn" type="submit">Criar grupo</button></form>
      <button class="link center" id="lo">Terminar sessão</button>`);
    $("#jf").addEventListener("submit", async (e) => { e.preventDefault(); const c = $("#jCode").value.trim(); if (c.length < 4) return toast("Escreve o código que recebeste.", "bad"); if (!needOnline()) return; const b = e.submitter || $("#jf button"); busy(b, true); try { await store.joinGroup(c); await afterLogin(); } catch (er) { toast(errMsg(er), "bad"); busy(b, false); } });
    $("#cf").addEventListener("submit", async (e) => { e.preventDefault(); const n = $("#cName").value.trim(); if (n.length < 2) return toast("O nome do grupo precisa de pelo menos 2 letras.", "bad"); if (!needOnline()) return; const b = e.submitter || $("#cf button"); busy(b, true); try { await store.createGroup(n); await afterLogin(); } catch (er) { toast(errMsg(er), "bad"); busy(b, false); } });
    $("#lo").addEventListener("click", signOutClean);
  }
  async function afterLogin() {
    if (!store.profile) await store.loadProfile();
    if (!store.profile) { await store.signOut(); return vAuth("in", "Não encontrei o teu perfil. Entra outra vez."); }
    if (!store.profile.group_id) return vGroupSetup();
    if (location.search) history.replaceState(null, "", location.pathname + location.hash);
    buildShell();
    S.view = "inicio"; $("#view").innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
    await refresh(true);
    route();
    store.subscribe((table) => {
      if (S.view === "feed" && table !== "checkins") {
        const reading = window.scrollY > 200 || (document.activeElement && $("#posts")?.contains(document.activeElement));
        if (reading) { F.newer = true; const np = $("#newPill"); if (np) np.hidden = false; } else loadPosts(true);
      }
      if (table === "checkins") refresh(true);
    });
  }

  // ---------- arranque ----------
  async function boot() {
    const c = window.YFX_CONFIG || {};
    if (!window.supabase || !c.supabaseUrl || !c.supabaseAnonKey) {
      authShell(`<div class="auth-owl">${yofi("alerta", 96)}</div><p class="center">Não consegui abrir a app. Verifica a ligação e tenta outra vez.</p><button class="btn primary" id="reloadBtn">Tentar outra vez</button>`);
      return;
    }
    store = new window.YFXStore.Store(c.supabaseUrl, c.supabaseAnonKey);
    store.onSignedOut = () => { if (document.body.classList.contains("in-app")) { store.unsubscribe(); vAuth("in", "A tua sessão terminou. Entra outra vez."); } };
    try {
      const logged = await store.init();
      if (!logged) return vAuth(new URLSearchParams(location.search).get("c") ? "up" : "in");
      await afterLogin();
    } catch (e) {
      authShell(`<div class="auth-owl">${yofi("alerta", 96)}</div><p class="center">${esc(errMsg(e))}</p><button class="btn primary" id="reloadBtn">Tentar outra vez</button>`);
    }
  }
  window.addEventListener("hashchange", () => { if (document.body.classList.contains("in-app")) route(); });
  window.addEventListener("online", () => { updateNet(); if (store?.profile?.group_id) refresh(true); });
  window.addEventListener("offline", updateNet);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && store?.profile?.group_id && document.body.classList.contains("in-app")) refresh(); });

  // service worker: atualização avisada ao utilizador
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      const offer = (w) => {
        const t = document.createElement("div"); t.className = "toast update"; t.setAttribute("role", "status");
        t.innerHTML = `Nova versão da app disponível <button class="btn sm primary">Atualizar</button>`;
        t.querySelector("button").onclick = () => w.postMessage("skipWaiting");
        $("#toasts").appendChild(t);
      };
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener("updatefound", () => { const w = reg.installing; w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(w); }); });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloaded) return; reloaded = true; if (!getDraftSafe()) location.reload(); });
  }
  function getDraftSafe() { try { return store && store.uid && localStorage.getItem("yfxgym-draft-" + store.uid) && S.view === "treino"; } catch (e) { return false; } }
  boot();
})();
