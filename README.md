# YFX Gym · Versão 1

App de ginásio privada para um grupo de amigos. A Yofi, a coruja da YFX, vigia o grupo. Powered by YFX.

## O que tem a V1
- **Grupo privado** com código de convite (só entra quem tem o código)
- **Check-in** no ginásio confirmado por GPS (raio de 250 m do ginásio guardado no primeiro check-in)
- **Meta semanal** de idas (2 a 7) e **meta de peso** por semana, com pesagem de segunda-feira
- **Registo de treino** (séries, repetições, carga) com deteção automática de recordes pessoais
- **Feed** do grupo com publicações automáticas, texto, fotos, reações e comentários (tempo real)
- **Ranking semanal** pela % da meta (máx. 100%), desempate por idas e volume
- **Yofi vigia**: lembra a meta, a pesagem, e aponta quem anda a faltar
- Instala-se no telemóvel (PWA): no Chrome, menu ⋮ → "Adicionar ao ecrã principal"; no iPhone, Partilhar → "Adicionar ao ecrã principal"

## Estrutura
```
index.html            app
css/app.css           visual (identidade YFX)
js/config.js          chaves do Supabase (vazio = modo demonstração)
js/store.js           dados: modo demonstração (localStorage) e Supabase
js/app.js             ecrãs e lógica
js/yofi.js            a coruja Yofi (SVG, poses: ola, alerta, celebra)
js/exercises.js       lista de exercícios
supabase/schema.sql   base de dados + segurança (RLS) + fotos
```

## Pôr a funcionar com amigos
1. Criar projeto no Supabase e correr `supabase/schema.sql` no SQL Editor.
2. Em Authentication → URL Configuration, pôr o link do GitHub Pages como Site URL.
3. Copiar o Project URL e a anon key para `js/config.js`.
4. Publicar no GitHub Pages (Settings → Pages → branch `main`, pasta `/`).
