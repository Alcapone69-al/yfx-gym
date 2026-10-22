-- YFX Gym · 002 · Auditoria: segurança, privacidade, integridade e fuso horário
-- Princípio: o browser nunca decide nada crítico. Check-ins, treinos/recordes, pesagens, metas
-- semanais e ranking são validados e calculados aqui, no servidor.

-- ============ 1. GRUPO: fuso horário único, limite de membros, códigos melhores ============
alter table public.groups add column if not exists timezone text not null default 'Africa/Maputo';
alter table public.groups add column if not exists max_members int not null default 30;
do $$ begin
  alter table public.groups add constraint groups_max_members_chk check (max_members between 2 and 100);
exception when duplicate_object then null; end $$;

create or replace function public.group_tz(g uuid) returns text
language sql stable security definer set search_path = public as
$$ select coalesce((select timezone from public.groups where id = g), 'Africa/Maputo') $$;

-- "hoje" no fuso do grupo (não no do telemóvel)
create or replace function public.local_today(g uuid) returns date
language sql stable security definer set search_path = public as
$$ select (now() at time zone public.group_tz(g))::date $$;

-- semana começa à segunda-feira
create or replace function public.week_start_of(d date) returns date
language sql immutable set search_path = public as
$$ select d - (extract(isodow from d)::int - 1) $$;

create or replace function public.gen_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text := ''; i int;
begin
  for i in 1..8 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
  return c;
end $$;

-- ============ 2. PERFIL: localização do ginásio deixa de estar visível ao grupo ============
create table if not exists public.gym_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  set_at timestamptz not null default now()
);
alter table public.gym_locations enable row level security;
drop policy if exists "ver o meu ginasio" on public.gym_locations;
create policy "ver o meu ginasio" on public.gym_locations for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.gym_locations from authenticated, anon;

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'gym_lat') then
    insert into public.gym_locations (user_id, lat, lng)
      select id, gym_lat, gym_lng from public.profiles where gym_lat is not null and gym_lng is not null
      on conflict (user_id) do nothing;
    alter table public.profiles drop column gym_lat, drop column gym_lng;
  end if;
end $$;

alter table public.profiles add column if not exists avatar_path text;
revoke update on public.profiles from authenticated, anon;
grant update (name, color, visits_target, weight_goal_kg) on public.profiles to authenticated;
do $$ begin
  alter table public.profiles add constraint profiles_color_chk check (color ~ '^#[0-9a-fA-F]{6}$');
exception when duplicate_object then null; end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1), 'Atleta'), 30))
  on conflict (id) do nothing;
  return new;
end $$;

-- ============ 3. METAS SEMANAIS CONGELADAS (não dá para baixar a meta a meio da semana) ============
create table if not exists public.week_targets (
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  visits_target int not null check (visits_target between 2 and 7),
  weight_goal_kg numeric(4,2) not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.week_targets enable row level security;
drop policy if exists "metas do grupo" on public.week_targets;
create policy "metas do grupo" on public.week_targets for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = week_targets.user_id and p.group_id = public.my_group()));
revoke insert, update, delete on public.week_targets from authenticated, anon;

create or replace function public.ensure_week_target(p_user uuid, p_week date) returns public.week_targets
language plpgsql security definer set search_path = public as $$
declare r public.week_targets;
begin
  insert into public.week_targets (user_id, week_start, visits_target, weight_goal_kg)
    select id, p_week, visits_target, weight_goal_kg from public.profiles where id = p_user
  on conflict (user_id, week_start) do nothing;
  select * into r from public.week_targets where user_id = p_user and week_start = p_week;
  return r;
end $$;

-- ============ 4. CHECK-INS: só pelo servidor, 1 por dia, distância calculada aqui ============
alter table public.checkins add column if not exists local_date date;
update public.checkins c set local_date = (c.created_at at time zone public.group_tz(c.group_id))::date where local_date is null;
alter table public.checkins alter column local_date set not null;
-- apagar duplicados antigos do mesmo dia antes do índice único
delete from public.checkins a using public.checkins b
  where a.user_id = b.user_id and a.local_date = b.local_date and a.created_at > b.created_at;
create unique index if not exists checkins_one_per_day on public.checkins (user_id, local_date);
create index if not exists checkins_group_day on public.checkins (group_id, local_date);
drop policy if exists "criar no grupo" on public.checkins;
drop policy if exists "apagar o meu" on public.checkins;
revoke insert, update, delete on public.checkins from authenticated, anon;

create or replace function public.distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8) returns float8
language sql immutable set search_path = public as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

alter table public.posts drop constraint if exists posts_kind_check;
alter table public.posts add constraint posts_kind_check check (kind in ('text','photo','checkin','workout','weighin','goal','gym'));

create or replace function public.check_in(p_lat float8, p_lng float8, p_accuracy float8) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g uuid; d date; ws date; gym public.gym_locations; dist float8; wt public.week_targets; v int; prev_at timestamptz;
begin
  if uid is null then raise exception 'AUTH'; end if;
  select group_id into g from public.profiles where id = uid;
  if g is null then raise exception 'NO_GROUP'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'BAD_LOCATION'; end if;
  if p_accuracy is null or p_accuracy <= 0 or p_accuracy > 150 then raise exception 'LOW_ACCURACY'; end if;
  d := public.local_today(g); ws := public.week_start_of(d);
  select created_at into prev_at from public.checkins where user_id = uid and local_date = d;
  if found then return jsonb_build_object('status', 'already', 'at', prev_at); end if;
  select * into gym from public.gym_locations where user_id = uid;
  if not found then raise exception 'NO_GYM'; end if;
  dist := public.distance_m(gym.lat, gym.lng, p_lat, p_lng);
  if dist - least(p_accuracy, 100) > 250 then raise exception 'TOO_FAR:%', round(dist)::int; end if;
  insert into public.checkins (user_id, group_id, verified, distance_m, local_date)
    values (uid, g, true, round(dist)::int, d) on conflict (user_id, local_date) do nothing;
  if not found then return jsonb_build_object('status', 'already'); end if;
  insert into public.posts (group_id, user_id, kind, meta) values (g, uid, 'checkin', '{}');
  wt := public.ensure_week_target(uid, ws);
  select count(*) into v from public.checkins where user_id = uid and local_date between ws and ws + 6;
  if v = wt.visits_target then
    insert into public.posts (group_id, user_id, kind, meta)
      values (g, uid, 'goal', jsonb_build_object('visits', v, 'target', wt.visits_target, 'week', ws));
  end if;
  return jsonb_build_object('status', 'ok', 'visits', v, 'target', wt.visits_target, 'goal_reached', v = wt.visits_target, 'first_of_week', v = 1);
end $$;

-- guardar/mudar o ginásio (no máximo 1 mudança por semana) e fazer o check-in
create or replace function public.set_gym_and_check_in(p_lat float8, p_lng float8, p_accuracy float8) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g uuid; old public.gym_locations; had boolean;
begin
  if uid is null then raise exception 'AUTH'; end if;
  select group_id into g from public.profiles where id = uid;
  if g is null then raise exception 'NO_GROUP'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'BAD_LOCATION'; end if;
  if p_accuracy is null or p_accuracy <= 0 or p_accuracy > 100 then raise exception 'LOW_ACCURACY'; end if;
  select * into old from public.gym_locations where user_id = uid;
  had := found;
  if had and old.set_at > now() - interval '7 days' then raise exception 'GYM_RECENT'; end if;
  insert into public.gym_locations (user_id, lat, lng, set_at) values (uid, p_lat, p_lng, now())
    on conflict (user_id) do update set lat = excluded.lat, lng = excluded.lng, set_at = now();
  if had then insert into public.posts (group_id, user_id, kind, meta) values (g, uid, 'gym', '{}'); end if;
  return public.check_in(p_lat, p_lng, p_accuracy);
end $$;

create or replace function public.forget_gym() returns void
language sql security definer set search_path = public as
$$ delete from public.gym_locations where user_id = auth.uid() and set_at < now() - interval '7 days' $$;

-- ============ 5. PESAGENS: privadas; o grupo vê só a variação ============
alter table public.weighins add column if not exists local_date date;
update public.weighins w set local_date = (w.created_at at time zone public.group_tz(w.group_id))::date where local_date is null;
alter table public.weighins alter column local_date set not null;
delete from public.weighins a using public.weighins b
  where a.user_id = b.user_id and a.local_date = b.local_date and a.created_at < b.created_at;
create unique index if not exists weighins_one_per_day on public.weighins (user_id, local_date);
drop policy if exists "ler do grupo" on public.weighins;
drop policy if exists "criar no grupo" on public.weighins;
drop policy if exists "apagar o meu" on public.weighins;
drop policy if exists "ver as minhas pesagens" on public.weighins;
create policy "ver as minhas pesagens" on public.weighins for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.weighins from authenticated, anon;

-- peso de início de uma semana: 1.ª pesagem dessa semana, senão a última antes dela
create or replace function public.week_start_weight(p_user uuid, p_ws date) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select kg from public.weighins where user_id = p_user and local_date between p_ws and p_ws + 6 order by local_date asc limit 1),
    (select kg from public.weighins where user_id = p_user and local_date < p_ws order by local_date desc limit 1))
$$;

create or replace function public.weigh_result(delta numeric, goal numeric) returns text
language sql immutable set search_path = public as $$
  select case
    when goal = 0 then case when abs(delta) <= 0.5 then 'cumpriu' else 'falhou' end
    when delta / goal >= 1 then 'cumpriu'
    when delta / goal >= 0.6 then 'perto'
    else 'falhou' end
$$;

create or replace function public.my_weight() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g uuid; d date; ws date; s numeric; cur numeric; wt public.week_targets; tw boolean;
begin
  if uid is null then raise exception 'AUTH'; end if;
  select group_id into g from public.profiles where id = uid;
  if g is null then raise exception 'NO_GROUP'; end if;
  d := public.local_today(g); ws := public.week_start_of(d);
  wt := public.ensure_week_target(uid, ws);
  s := public.week_start_weight(uid, ws);
  select kg into cur from public.weighins where user_id = uid order by local_date desc limit 1;
  tw := exists (select 1 from public.weighins where user_id = uid and local_date between ws and ws + 6);
  return jsonb_build_object('start', s, 'current', cur, 'goal', wt.weight_goal_kg,
    'target', case when s is null then null else s + wt.weight_goal_kg end,
    'delta', case when s is null or cur is null then null else cur - s end,
    'this_week', tw, 'today', d, 'week_start', ws);
end $$;

create or replace function public.log_weight(p_kg numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g uuid; d date; ws date; kg numeric; today_existed boolean; first_of_week boolean; prev_start numeric; prev_goal numeric; delta numeric;
begin
  if uid is null then raise exception 'AUTH'; end if;
  select group_id into g from public.profiles where id = uid;
  if g is null then raise exception 'NO_GROUP'; end if;
  if p_kg is null or p_kg < 30 or p_kg > 300 then raise exception 'BAD_WEIGHT'; end if;
  kg := round(p_kg, 1);
  d := public.local_today(g); ws := public.week_start_of(d);
  today_existed := exists (select 1 from public.weighins where user_id = uid and local_date = d);
  first_of_week := not exists (select 1 from public.weighins where user_id = uid and local_date between ws and ws + 6);
  insert into public.weighins (user_id, group_id, kg, local_date) values (uid, g, kg, d)
    on conflict (user_id, local_date) do update set kg = excluded.kg, created_at = now();
  perform public.ensure_week_target(uid, ws);
  if first_of_week and not today_existed then
    prev_start := public.week_start_weight(uid, ws - 7);
    if prev_start is not null then
      prev_goal := coalesce((select weight_goal_kg from public.week_targets where user_id = uid and week_start = ws - 7),
                            (select weight_goal_kg from public.profiles where id = uid));
      delta := kg - prev_start;
      insert into public.posts (group_id, user_id, kind, meta)
        values (g, uid, 'weighin', jsonb_build_object('delta', round(delta, 1), 'goal', prev_goal, 'result', public.weigh_result(delta, prev_goal), 'week', ws - 7));
    elsif not exists (select 1 from public.weighins where user_id = uid and local_date <> d) then
      insert into public.posts (group_id, user_id, kind, meta)
        values (g, uid, 'weighin', jsonb_build_object('first', true, 'goal', (select weight_goal_kg from public.profiles where id = uid)));
    end if;
  end if;
  return public.my_weight();
end $$;

-- ============ 6. TREINOS E RECORDES: validados e calculados no servidor, sem duplicados ============
alter table public.workouts add column if not exists client_id uuid;
create unique index if not exists workouts_client_id on public.workouts (client_id) where client_id is not null;
create index if not exists workouts_user_time on public.workouts (user_id, created_at desc);
drop policy if exists "criar no grupo" on public.workouts;
revoke insert, update on public.workouts from authenticated, anon;

create table if not exists public.personal_bests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  ex text not null check (char_length(ex) between 1 and 60),
  kg numeric not null check (kg >= 0),
  reps int not null check (reps >= 1),
  achieved_at timestamptz not null default now(),
  workout_id uuid references public.workouts(id) on delete set null,
  primary key (user_id, ex)
);
alter table public.personal_bests enable row level security;
drop policy if exists "recordes do grupo" on public.personal_bests;
create policy "recordes do grupo" on public.personal_bests for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = personal_bests.user_id and p.group_id = public.my_group()));
revoke insert, update, delete on public.personal_bests from authenticated, anon;

-- recalcular recordes a partir dos treinos existentes
insert into public.personal_bests (user_id, ex, kg, reps, achieved_at, workout_id)
select distinct on (w.user_id, s->>'ex') w.user_id, s->>'ex', (s->>'kg')::numeric, (s->>'reps')::int, w.created_at, w.id
from public.workouts w, jsonb_array_elements(w.sets) s
where (s->>'kg') ~ '^\d+(\.\d+)?$' and (s->>'reps') ~ '^\d+$' and (s->>'reps')::int >= 1 and char_length(s->>'ex') between 1 and 60
order by w.user_id, s->>'ex', (s->>'kg')::numeric desc, w.created_at asc
on conflict (user_id, ex) do nothing;

create or replace function public.finish_workout(p_client_id uuid, p_title text, p_sets jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g uuid; clean jsonb; vol numeric; prs jsonb; w public.workouts; t text; n_ex int; n_sets int;
begin
  if uid is null then raise exception 'AUTH'; end if;
  select group_id into g from public.profiles where id = uid;
  if g is null then raise exception 'NO_GROUP'; end if;
  if p_client_id is null then raise exception 'BAD_SETS'; end if;
  -- mesmo treino enviado duas vezes: devolve o primeiro
  select * into w from public.workouts where client_id = p_client_id;
  if found then
    if w.user_id <> uid then raise exception 'BAD_SETS'; end if;
    return jsonb_build_object('id', w.id, 'volume', w.volume, 'prs', w.prs, 'duplicate', true,
      'n_sets', jsonb_array_length(w.sets), 'n_ex', (select count(distinct s->>'ex') from jsonb_array_elements(w.sets) s));
  end if;
  if p_sets is null or jsonb_typeof(p_sets) <> 'array' or jsonb_array_length(p_sets) not between 1 and 150 then raise exception 'BAD_SETS'; end if;
  if exists (select 1 from jsonb_array_elements(p_sets) e where
      jsonb_typeof(e) <> 'object'
      or char_length(trim(coalesce(e->>'ex', ''))) not between 1 and 60
      or coalesce(e->>'reps', '') !~ '^\d{1,4}$' or (e->>'reps')::int not between 1 and 1000
      or coalesce(e->>'kg', '') !~ '^\d{1,4}(\.\d{1,2})?$' or (e->>'kg')::numeric > 1000) then
    raise exception 'BAD_SETS';
  end if;
  select jsonb_agg(jsonb_build_object('ex', trim(e->>'ex'), 'reps', (e->>'reps')::int, 'kg', (e->>'kg')::numeric) order by o)
    into clean from jsonb_array_elements(p_sets) with ordinality x(e, o);
  t := left(coalesce(nullif(trim(p_title), ''), 'Treino'), 60);
  select coalesce(sum((s->>'kg')::numeric * (s->>'reps')::int), 0), count(*), count(distinct s->>'ex')
    into vol, n_sets, n_ex from jsonb_array_elements(clean) s;
  -- um treino de cada vez por pessoa (evita recordes duplicados em pedidos simultâneos)
  perform pg_advisory_xact_lock(hashtext('workout:' || uid::text));
  select * into w from public.workouts where client_id = p_client_id;
  if found then return jsonb_build_object('id', w.id, 'volume', w.volume, 'prs', w.prs, 'duplicate', true, 'n_sets', n_sets, 'n_ex', n_ex); end if;
  -- recorde = maior carga de sempre num exercício já feito antes (1.ª vez não conta; empate não conta)
  with cur as (
    select distinct on (s->>'ex') s->>'ex' as ex, (s->>'kg')::numeric as kg, (s->>'reps')::int as reps
    from jsonb_array_elements(clean) s order by s->>'ex', (s->>'kg')::numeric desc, (s->>'reps')::int desc)
  select coalesce(jsonb_agg(jsonb_build_object('ex', cur.ex, 'kg', cur.kg, 'reps', cur.reps)), '[]'::jsonb) into prs
  from cur join public.personal_bests pb on pb.user_id = uid and pb.ex = cur.ex
  where cur.kg > 0 and cur.kg > pb.kg;
  insert into public.workouts (user_id, group_id, title, sets, volume, prs, client_id)
    values (uid, g, t, clean, vol, prs, p_client_id) returning * into w;
  insert into public.personal_bests (user_id, ex, kg, reps, achieved_at, workout_id)
    select distinct on (s->>'ex') uid, s->>'ex', (s->>'kg')::numeric, (s->>'reps')::int, now(), w.id
    from jsonb_array_elements(clean) s order by s->>'ex', (s->>'kg')::numeric desc, (s->>'reps')::int desc
  on conflict (user_id, ex) do update set kg = excluded.kg, reps = excluded.reps, achieved_at = excluded.achieved_at, workout_id = excluded.workout_id
    where excluded.kg > personal_bests.kg;
  insert into public.posts (group_id, user_id, kind, meta)
    values (g, uid, 'workout', jsonb_build_object('workout_id', w.id, 'title', t, 'n_ex', n_ex, 'n_sets', n_sets, 'volume', vol, 'prs', prs));
  return jsonb_build_object('id', w.id, 'volume', vol, 'prs', prs, 'duplicate', false, 'n_sets', n_sets, 'n_ex', n_ex);
end $$;

-- ============ 7. FEED: o utilizador só cria texto/foto; o resto é o servidor ============
alter table public.posts add column if not exists photo_path text;
alter table public.posts drop column if exists photo_url;
drop policy if exists "criar no grupo" on public.posts;
create policy "criar no grupo" on public.posts for insert to authenticated with check (
  user_id = auth.uid() and group_id = public.my_group() and kind in ('text', 'photo')
  and (photo_path is null or photo_path like public.my_group()::text || '/' || auth.uid()::text || '/%')
  and (char_length(trim(body)) > 0 or photo_path is not null)
  and (kind = 'photo') = (photo_path is not null));
drop policy if exists "apagar o meu" on public.posts;
create policy "apagar o meu" on public.posts for delete to authenticated using (user_id = auth.uid() and kind in ('text', 'photo'));
revoke update on public.posts from authenticated, anon;

create or replace function public.posts_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('text', 'photo') and (select count(*) from public.posts where user_id = new.user_id and kind in ('text','photo') and created_at > now() - interval '10 minutes') >= 15 then
    raise exception 'RATE_LIMIT';
  end if;
  return new;
end $$;
drop trigger if exists posts_rate_limit on public.posts;
create trigger posts_rate_limit before insert on public.posts for each row execute function public.posts_rate_limit();

-- reações e comentários só em publicações do próprio grupo
drop policy if exists "criar no grupo" on public.reactions;
create policy "criar no grupo" on public.reactions for insert to authenticated with check (
  user_id = auth.uid() and group_id = public.my_group()
  and exists (select 1 from public.posts p where p.id = post_id and p.group_id = public.my_group()));
drop policy if exists "criar no grupo" on public.comments;
create policy "criar no grupo" on public.comments for insert to authenticated with check (
  user_id = auth.uid() and group_id = public.my_group()
  and exists (select 1 from public.posts p where p.id = post_id and p.group_id = public.my_group()));
revoke update on public.reactions, public.comments from authenticated, anon;

create or replace function public.comments_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.comments where user_id = new.user_id and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'RATE_LIMIT';
  end if;
  return new;
end $$;
drop trigger if exists comments_rate_limit on public.comments;
create trigger comments_rate_limit before insert on public.comments for each row execute function public.comments_rate_limit();

-- ============ 8. FOTOS: bucket privado, só membros do grupo veem; limite de tamanho e tipo ============
update storage.buckets set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] where id = 'photos';
drop policy if exists "membros enviam fotos" on storage.objects;
drop policy if exists "membros veem fotos" on storage.objects;
drop policy if exists "apagar as minhas fotos" on storage.objects;
create policy "membros enviam fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_group()::text and (storage.foldername(name))[2] = auth.uid()::text);
create policy "membros veem fotos" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_group()::text);
create policy "apagar as minhas fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[2] = auth.uid()::text);

create or replace function public.set_avatar(p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g uuid;
begin
  if uid is null then raise exception 'AUTH'; end if;
  select group_id into g from public.profiles where id = uid;
  if p_path is not null and (g is null or p_path not like g::text || '/' || uid::text || '/%') then raise exception 'BAD_PATH'; end if;
  update public.profiles set avatar_path = p_path where id = uid;
end $$;

-- ============ 9. CONVITES E MEMBROS ============
create table if not exists public.join_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists join_attempts_user_time on public.join_attempts (user_id, at desc);
alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from authenticated, anon;

create or replace function public.create_group(p_name text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare g public.groups; code text; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH'; end if;
  if (select group_id from public.profiles where id = uid) is not null then raise exception 'ALREADY_IN_GROUP'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 40 then raise exception 'BAD_NAME'; end if;
  loop
    code := public.gen_invite_code();
    exit when not exists (select 1 from public.groups where invite_code = code);
  end loop;
  insert into public.groups (name, invite_code, created_by) values (trim(p_name), code, uid) returning * into g;
  update public.profiles set group_id = g.id where id = uid;
  return g;
end $$;

create or replace function public.join_group(p_code text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare g public.groups; uid uuid := auth.uid(); cur uuid; n int;
begin
  if uid is null then raise exception 'AUTH'; end if;
  if (select count(*) from public.join_attempts where user_id = uid and at > now() - interval '1 hour') >= 10 then raise exception 'RATE_LIMIT'; end if;
  insert into public.join_attempts (user_id) values (uid);
  select * into g from public.groups where invite_code = upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  if g.id is null then raise exception 'INVALID_CODE'; end if;
  select group_id into cur from public.profiles where id = uid;
  if cur = g.id then return g; end if;
  if cur is not null then raise exception 'ALREADY_IN_GROUP'; end if;
  select count(*) into n from public.profiles where group_id = g.id;
  if n >= g.max_members then raise exception 'GROUP_FULL'; end if;
  update public.profiles set group_id = g.id where id = uid;
  return g;
end $$;

create or replace function public.leave_group() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g uuid; heir uuid;
begin
  if uid is null then raise exception 'AUTH'; end if;
  select group_id into g from public.profiles where id = uid;
  if g is null then return; end if;
  update public.profiles set group_id = null where id = uid;
  if (select created_by from public.groups where id = g) = uid then
    select id into heir from public.profiles where group_id = g order by created_at asc limit 1;
    update public.groups set created_by = heir where id = g;
  end if;
end $$;

create or replace function public.rotate_invite() returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g uuid; code text;
begin
  select group_id into g from public.profiles where id = uid;
  if g is null or (select created_by from public.groups where id = g) is distinct from uid then raise exception 'NOT_OWNER'; end if;
  loop
    code := public.gen_invite_code();
    exit when not exists (select 1 from public.groups where invite_code = code);
  end loop;
  update public.groups set invite_code = code where id = g;
  return code;
end $$;

create or replace function public.remove_member(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g uuid;
begin
  select group_id into g from public.profiles where id = uid;
  if g is null or (select created_by from public.groups where id = g) is distinct from uid then raise exception 'NOT_OWNER'; end if;
  if p_user = uid then raise exception 'NOT_ALLOWED'; end if;
  update public.profiles set group_id = null where id = p_user and group_id = g;
end $$;

-- ============ 10. RANKING SEMANAL (calculado no servidor, no fuso do grupo) ============
create or replace function public.week_ranking(p_weeks_ago int default 0)
returns table (user_id uuid, name text, color text, avatar_path text, visits int, target int, pct int,
               workouts int, volume numeric, weight_delta numeric, last_visit date, week_start date, today date)
language plpgsql security definer set search_path = public as $$
declare g uuid := public.my_group(); d date; ws date; tz text; m record;
begin
  if g is null then raise exception 'NO_GROUP'; end if;
  tz := public.group_tz(g);
  d := public.local_today(g);
  ws := public.week_start_of(d) - 7 * greatest(0, least(coalesce(p_weeks_ago, 0), 52));
  if ws = public.week_start_of(d) then
    for m in select id from public.profiles where group_id = g loop perform public.ensure_week_target(m.id, ws); end loop;
  end if;
  return query
  with base as (
    select p.id, p.name, p.color, p.avatar_path,
      coalesce(t.visits_target, p.visits_target) as tgt,
      (select count(*)::int from public.checkins c where c.user_id = p.id and c.local_date between ws and ws + 6) as v,
      (select count(*)::int from public.workouts w where w.user_id = p.id and (w.created_at at time zone tz)::date between ws and ws + 6) as wk,
      (select coalesce(sum(w.volume), 0) from public.workouts w where w.user_id = p.id and (w.created_at at time zone tz)::date between ws and ws + 6) as vol,
      case when exists (select 1 from public.weighins x where x.user_id = p.id and x.local_date between ws and ws + 6)
        then (select x.kg from public.weighins x where x.user_id = p.id and x.local_date <= ws + 6 order by x.local_date desc limit 1)
             - public.week_start_weight(p.id, ws) end as wd,
      (select max(c.local_date) from public.checkins c where c.user_id = p.id) as lv
    from public.profiles p
    left join public.week_targets t on t.user_id = p.id and t.week_start = ws
    where p.group_id = g)
  select b.id, b.name, b.color, b.avatar_path, b.v, b.tgt,
         least(100, floor(b.v * 100.0 / greatest(b.tgt, 1)))::int,
         b.wk, b.vol, round(b.wd, 1), b.lv, ws, d
  from base b
  order by least(100, floor(b.v * 100.0 / greatest(b.tgt, 1))) desc, b.v desc, b.vol desc, b.name asc;
end $$;

create or replace function public.group_bests(p_ex text[]) returns table (ex text, user_id uuid, kg numeric, reps int)
language sql stable security definer set search_path = public as $$
  select distinct on (pb.ex) pb.ex, pb.user_id, pb.kg, pb.reps
  from public.personal_bests pb join public.profiles p on p.id = pb.user_id
  where p.group_id = public.my_group() and pb.ex = any(p_ex) and pb.kg > 0
  order by pb.ex, pb.kg desc, pb.achieved_at asc
$$;

-- ============ 11. PERMISSÕES DAS FUNÇÕES ============
do $$
declare f text;
begin
  -- funções internas: ninguém as chama pela API
  foreach f in array array['group_tz(uuid)', 'local_today(uuid)', 'ensure_week_target(uuid, date)', 'week_start_weight(uuid, date)',
                           'gen_invite_code()', 'handle_new_user()', 'posts_rate_limit()', 'comments_rate_limit()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  -- funções da app: só utilizadores com sessão
  foreach f in array array['check_in(float8, float8, float8)', 'set_gym_and_check_in(float8, float8, float8)', 'forget_gym()',
                           'my_weight()', 'log_weight(numeric)', 'finish_workout(uuid, text, jsonb)', 'set_avatar(text)',
                           'create_group(text)', 'join_group(text)', 'leave_group()', 'rotate_invite()', 'remove_member(uuid)',
                           'week_ranking(int)', 'group_bests(text[])', 'my_group()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
