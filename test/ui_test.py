"""Testes de interface do YFX Gym com um servidor Supabase simulado (test/mock-supabase.js).
Uso: python3 test/ui_test.py <pasta_para_capturas>
"""
import json, sys, threading, http.server, functools, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
MOCK = (ROOT / "test" / "mock-supabase.js").read_text()

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=str(ROOT))
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_port}/index.html"

results, errors = [], []
def check(name, cond, extra=""):
    results.append(("OK " if cond else "FALHA ") + name + (f" — {extra}" if extra else ""))

def page_for(b, w, h, mock=None, geo=True, mobile=True, accuracy=20):
    ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile,
                        geolocation={"latitude": -25.9653, "longitude": 32.5892, "accuracy": accuracy} if geo else None,
                        permissions=["geolocation"] if geo else [])
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(f"{w}x{h}: {e}"))
    pg.on("console", lambda m: m.type == "error" and errors.append(f"{w}x{h} console: {m.text}"))
    pg.add_init_script("window.__MOCK=" + json.dumps(mock or {}) + ";")
    pg.route("**/js/vendor/supabase.js", lambda r: r.fulfill(status=200, content_type="application/javascript", body=MOCK))
    return ctx, pg

def overflow(pg): return pg.evaluate("document.documentElement.scrollWidth - window.innerWidth")
def toast(pg):
    pg.wait_for_timeout(250)
    return pg.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.textContent).join(' | ')")

with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------- fluxo completo, telemóvel 390 ----------
    ctx, pg = page_for(b, 390, 844)
    pg.goto(URL + "#inicio"); pg.wait_for_selector("#btnCheckin")
    pg.screenshot(path=str(OUT / "01_inicio.png"), full_page=True)
    check("início sem scroll horizontal", overflow(pg) <= 0)
    check("powered by YFX visível", pg.is_visible(".powered"))
    check("Yofi presente", pg.locator(".vigia svg.yofi").count() == 1)
    pg.click("#btnCheckin"); pg.wait_for_selector(".ck-done", timeout=5000)
    check("check-in GPS concluído", "Check-in feito" in pg.inner_text(".checkin"))
    pg.fill("#wIn", "abc"); pg.click("#wForm button"); check("peso inválido recusado", "Escreve o peso" in toast(pg))
    pg.fill("#wIn", "-5"); pg.click("#wForm button"); check("peso negativo recusado", "Escreve o peso" in toast(pg))
    pg.fill("#wIn", "95,9"); pg.click("#wForm button"); pg.wait_for_timeout(600)
    check("pesagem registada", "95,9" in pg.inner_text(".weight"))

    pg.click("a.tab[data-tab=treino]"); pg.wait_for_selector("#startW")
    check("separador ativo com aria-current", pg.get_attribute("a.tab[data-tab=treino]", "aria-current") == "page")
    pg.click("#startW"); pg.wait_for_selector("#exQ"); pg.fill("#exQ", "supino"); pg.wait_for_timeout(150)
    pg.screenshot(path=str(OUT / "02_picker.png"))
    pg.click('.ex[data-n="Supino reto (barra)"]'); pg.wait_for_timeout(200)
    pg.fill('input[data-f=reps]', "3"); pg.fill('input[data-f=kg]', "-90")
    check("carga negativa limpa no campo", pg.input_value('input[data-f=kg]') == "90")
    pg.fill('input[data-f=kg]', "92,5"); check("vírgula decimal aceite", pg.input_value('input[data-f=kg]') == "92.5")
    pg.click('button[data-a=add]'); pg.wait_for_timeout(150)
    pg.click("#addEx"); pg.fill("#exQ", "supino reto"); pg.click('.ex[data-n="Supino reto (barra)"]'); pg.wait_for_timeout(200)
    check("exercício duplicado não é adicionado", pg.locator("#items .item").count() == 1, toast(pg))
    pg.reload(); pg.wait_for_selector("#finishW")
    check("treino sobrevive ao refresh", pg.locator("#items input[data-f=reps]").count() == 2)
    pg.screenshot(path=str(OUT / "03_treino.png"), full_page=True)
    pg.evaluate("document.querySelector('#finishW').click(); document.querySelector('#finishW').click();")
    pg.wait_for_selector(".sheet h3", timeout=5000)
    n_finish = pg.evaluate("__calls.filter(c=>c[1]==='finish_workout').length")
    check("duplo clique em Terminar envia 1 vez", n_finish == 1, f"{n_finish} envios")
    check("recorde mostrado", "recorde" in pg.inner_text(".sheet").lower())
    pg.screenshot(path=str(OUT / "04_recorde.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    check("Esc fecha a folha", pg.locator(".sheet-wrap").count() == 0)

    pg.goto(URL + "#feed"); pg.wait_for_selector(".post")
    pg.screenshot(path=str(OUT / "05_feed.png"), full_page=True)
    before = pg.inner_text('.post[data-id="p1"] .react[data-e="💪"]')
    pg.click('.post[data-id="p1"] .react[data-e="💪"]'); pg.wait_for_timeout(300)
    check("reação conta +1", pg.get_attribute('.post[data-id="p1"] .react[data-e="💪"]', "aria-pressed") == "true")
    pg.click('.post[data-id="p1"] .cm-toggle'); pg.fill('#cp1', "  "); pg.press('#cp1', "Enter"); pg.wait_for_timeout(200)
    check("comentário vazio ignorado", pg.evaluate("__calls.filter(c=>c[0]==='comments'&&c[1]==='insert').length") == 0)
    pg.fill('#cp1', "Bora <script>alert(1)</script>"); pg.press('#cp1', "Enter"); pg.wait_for_timeout(500)
    check("XSS escapado no comentário", pg.locator(".cm script").count() == 0 and "<script>" in pg.inner_text('.post[data-id="p1"] .cms'))
    pg.fill("#cmpTxt", "Teste de publicação"); pg.click("#cmp button[type=submit]"); pg.wait_for_timeout(500)
    check("publicação criada no topo", "Teste de publicação" in pg.inner_text("#posts .post >> nth=0"))
    pg.click('.post >> nth=0 >> [data-del]'); pg.wait_for_selector("#cOk"); pg.click("#cOk"); pg.wait_for_timeout(400)
    check("apagar publicação própria", "Teste de publicação" not in pg.inner_text("#posts"))

    pg.goto(URL + "#ranking"); pg.wait_for_selector(".rank li")
    pg.screenshot(path=str(OUT / "06_ranking.png"), full_page=True)
    names = pg.eval_on_selector_all(".rank .name", "els=>els.map(e=>e.textContent)")
    check("ranking ordenado por %", names[0].startswith("Chico"), str(names))
    pg.click('.seg button[data-w="1"]'); pg.wait_for_timeout(400)
    check("semana passada", "semana passada" in pg.inner_text("#rk").lower())
    pg.goto(URL + "#perfil"); pg.wait_for_selector("#pf")
    pg.screenshot(path=str(OUT / "07_perfil.png"), full_page=True)
    check("aviso de meta congelada", "próxima segunda" in pg.inner_text("#pf"))
    pg.go_back(); pg.wait_for_timeout(300)
    check("botão voltar do browser navega entre separadores", "ranking" in pg.url)
    pg.goto(URL + "#naoexiste"); pg.wait_for_timeout(500)
    check("rota inexistente vai para Início", pg.locator("#btnCheckin, .ck-done").count() == 1)
    ctx.close()

    # ---------- GPS: longe, sem ginásio, recusado, impreciso ----------
    ctx, pg = page_for(b, 375, 812, {"tooFar": True})
    pg.goto(URL); pg.wait_for_selector("#btnCheckin"); pg.click("#btnCheckin"); pg.wait_for_selector(".sheet h3")
    check("GPS longe do ginásio explicado", "km do teu ginásio" in pg.inner_text(".sheet h3"), pg.inner_text(".sheet h3"))
    pg.screenshot(path=str(OUT / "08_longe.png")); ctx.close()
    ctx, pg = page_for(b, 375, 812, {"noGym": True})
    pg.goto(URL); pg.wait_for_selector("#btnCheckin"); pg.click("#btnCheckin"); pg.wait_for_selector("#sYes")
    check("primeiro check-in pergunta pelo ginásio", True); pg.click("#sYes"); pg.wait_for_selector(".ck-done"); ctx.close()
    ctx, pg = page_for(b, 375, 812, geo=False)
    pg.goto(URL); pg.wait_for_selector("#btnCheckin"); pg.click("#btnCheckin"); pg.wait_for_selector(".sheet h3", timeout=20000)
    check("GPS recusado/indisponível explicado", "Sem localização" in pg.inner_text(".sheet h3"))
    check("sem atalho 'check-in sem GPS'", "sem GPS" not in pg.inner_text(".sheet"))
    pg.screenshot(path=str(OUT / "09_sem_gps.png")); ctx.close()
    ctx, pg = page_for(b, 375, 812, accuracy=400)
    pg.goto(URL); pg.wait_for_selector("#btnCheckin"); pg.click("#btnCheckin"); pg.wait_for_selector(".sheet h3", timeout=20000)
    check("GPS impreciso recusado no telemóvel", "pouco precisa" in pg.inner_text(".sheet h3")); ctx.close()

    # ---------- sem internet ----------
    ctx, pg = page_for(b, 390, 844)
    pg.goto(URL); pg.wait_for_selector("#btnCheckin")
    ctx.set_offline(True); pg.wait_for_timeout(200)
    check("barra 'sem internet'", pg.is_visible("#netBar"))
    pg.click("#btnCheckin"); check("check-in bloqueado sem rede", "sem internet" in toast(pg).lower())
    pg.screenshot(path=str(OUT / "10_offline.png"))
    ctx.set_offline(False); ctx.close()

    # ---------- muitos posts, textos longos, sem sessão ----------
    ctx, pg = page_for(b, 360, 740, {"manyPosts": True, "longText": True})
    pg.goto(URL + "#feed"); pg.wait_for_selector(".post")
    n1 = pg.locator(".post").count(); pg.click("#more"); pg.wait_for_timeout(600); n2 = pg.locator(".post").count()
    check("paginação do feed (20 + mais)", n1 == 20 and n2 > 20, f"{n1}→{n2}")
    check("texto longo sem scroll horizontal", overflow(pg) <= 0)
    ctx.close()
    ctx, pg = page_for(b, 390, 844, {"loggedOut": True})
    pg.goto(URL); pg.wait_for_selector("#af")
    check("sem sessão mostra login", pg.is_visible("#aEmail"))
    pg.click("#af button[type=submit]"); check("login vazio validado", "email válido" in toast(pg))
    pg.screenshot(path=str(OUT / "11_login.png")); ctx.close()

    # ---------- responsividade ----------
    sizes = [(320, 568), (360, 740), (375, 667), (393, 852), (412, 915), (430, 932), (600, 960), (768, 1024), (820, 1180), (1024, 768), (1280, 800), (1366, 768), (1440, 900), (1920, 1080), (2560, 1440), (844, 390)]
    for w, h in sizes:
        mobile = w < 900 and h > w or (w, h) == (844, 390)
        ctx, pg = page_for(b, w, h, mobile=mobile)
        for v in ["inicio", "feed", "treino", "ranking", "perfil"]:
            pg.goto(URL + "#" + v); pg.wait_for_timeout(450)
            o = overflow(pg)
            if o > 0: results.append(f"FALHA overflow {w}x{h} #{v}: {o}px")
            if v == "inicio" and w in (320, 768, 1440, 2560, 844): pg.screenshot(path=str(OUT / f"r_{w}x{h}_{v}.png"))
            if v == "ranking" and w in (320,): pg.screenshot(path=str(OUT / f"r_{w}x{h}_{v}.png"), full_page=True)
        # folha (modal) cabe no ecrã
        pg.goto(URL + "#treino"); pg.wait_for_selector("#startW"); pg.click("#startW"); pg.wait_for_selector(".sheet")
        bh = pg.evaluate("document.querySelector('.sheet').getBoundingClientRect().height")
        if bh > h: results.append(f"FALHA folha maior que o ecrã em {w}x{h}")
        if w in (320, 1440): pg.wait_for_timeout(350); pg.screenshot(path=str(OUT / f"r_{w}x{h}_sheet.png"))
        ctx.close()
    results.append("OK responsividade verificada em " + ", ".join(f"{w}x{h}" for w, h in sizes))
    b.close()

print("\n".join(results))
print("\nERROS DE JS:", "\n".join(errors) if errors else "nenhum")
