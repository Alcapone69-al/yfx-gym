# YFX Gym

App de ginásio privada para um grupo de amigos. A Yofi, a coruja da YFX, vigia o grupo. Powered by YFX.

App: https://alcapone69-al.github.io/yfx-gym/

## Versão 1
- **Grupo privado**: entra-se só com código de convite (8 caracteres; o criador pode gerar um novo e remover membros).
- **Check-in com GPS validado no servidor**: 1 por dia, a menos de 250 m do ginásio guardado. A localização do ginásio é privada; os amigos só veem que fizeste check-in.
- **Metas semanais**: idas por semana (2–7) e meta de peso. A meta fica fixa à segunda-feira (mudanças contam na semana seguinte).
- **Pesagens privadas**: o grupo só vê a variação semanal. Uma pesagem por dia.
- **Treinos**: séries/reps/carga validadas e recordes calculados no servidor; reenviar o mesmo treino não duplica.
- **Feed privado**: publicações automáticas, texto, fotos (bucket privado, links temporários), reações e comentários em tempo real.
- **Ranking semanal**: % da meta (máx. 100%), desempate por idas e volume; semana atual e anterior.
- **Fuso horário**: tudo no fuso do grupo (Africa/Maputo), semana de segunda a domingo.
- **PWA**: instala-se no ecrã inicial, abre sem rede (mostra os últimos dados) e avisa quando há versão nova.

## Estrutura
```
index.html               app (CSP restrita)
css/app.css              visual YFX (navy, azul→ciano, Manrope)
fonts/                   Manrope (servida pela própria app)
js/vendor/supabase.js    supabase-js 2.45.4 (servido pela própria app)
js/config.js             URL e chave pública do Supabase
js/store.js              dados: leituras + funções do servidor (RPC)
js/app.js                ecrãs, Yofi, GPS, offline
js/yofi.js               a coruja (SVG)
js/exercises.js          exercícios
sw.js                    service worker (subir VERSION a cada publicação)
supabase/migrations/     base de dados, por ordem
test/                    testes de interface com servidor simulado
```

## Testes
`python3 test/ui_test.py /tmp/capturas` — percorre todos os ecrãs e fluxos (GPS, offline, duplo clique, XSS, paginação) em 16 tamanhos de ecrã, de 320 px a 2560 px.
