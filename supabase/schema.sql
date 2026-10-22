-- YFX Gym · V1 · esquema Supabase
-- Grupo privado: cada pessoa pertence a um grupo (profiles.group_id) e só vê dados desse grupo.


-- ---------- tabelas ----------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  invite_code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Atleta' check (char_length(name) between 1 and 30),
  color text not null default '#22d3ee',
  visits_target int not null default 4 check (visits_target between 2 and 7),
  weight_goal_kg numeric(4,2) not null default 0 check (weight_goal_kg between -2 and 2),
  gym_lat double precision,
  gym_lng double precision,
  group_id uuid references public.groups(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  verified boolean not null default false,
  distance_m int,
  created_at timestamptz not null default now()
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  sets jsonb not null default '[]',
  volume numeric not null default 0,
  prs jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists public.weighins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  kg numeric(5,1) not null check (kg between 30 and 300),
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null default 'text' check (kind in ('text','photo','checkin','workout','weighin','goal')),
  body text not null default '' check (char_length(body) <= 1000),
  meta jsonb not null default '{}',
  photo_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  emoji text not null check (emoji in ('🔥','💪','👏','😂','👀')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists checkins_group_time on public.checkins (group_id, created_at desc);
create index if not exists workouts_group_time on public.workouts (group_id, created_at desc);
create index if not exists posts_group_time on public.posts (group_id, created_at desc);
create index if not exists weighins_group_time on public.weighins (group_id, created_at);
create index if not exists reactions_post on public.reactions (post_id);
create index if not exists comments_post on public.comments (post_id);

-- ---------- funções ----------
create or replace function public.my_group() returns uuid
language sql stable security definer set search_path = public as
$$ select group_id from public.profiles where id = auth.uid() $$;

-- cria o perfil quando alguém cria conta
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.create_group(p_name text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare g public.groups; code text;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  loop
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.groups where invite_code = code);
  end loop;
  insert into public.groups (name, invite_code, created_by) values (trim(p_name), code, auth.uid()) returning * into g;
  update public.profiles set group_id = g.id where id = auth.uid();
  return g;
end $$;

create or replace function public.join_group(p_code text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  select * into g from public.groups where invite_code = upper(trim(p_code));
  if g.id is null then raise exception 'Código inválido'; end if;
  update public.profiles set group_id = g.id where id = auth.uid();
  return g;
end $$;

revoke all on function public.create_group(text) from public, anon;
revoke all on function public.join_group(text) from public, anon;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;

-- ---------- segurança (RLS) ----------
alter table public.groups enable row level security;
alter table public.profiles enable row level security;
alter table public.checkins enable row level security;
alter table public.workouts enable row level security;
alter table public.weighins enable row level security;
alter table public.posts enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;

drop policy if exists "ver o meu grupo" on public.groups;
create policy "ver o meu grupo" on public.groups for select to authenticated using (id = public.my_group());

drop policy if exists "ver perfis do grupo" on public.profiles;
create policy "ver perfis do grupo" on public.profiles for select to authenticated
  using (id = auth.uid() or (group_id is not null and group_id = public.my_group()));
drop policy if exists "editar o meu perfil" on public.profiles;
create policy "editar o meu perfil" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- o grupo só muda pelas funções create_group / join_group
revoke insert, update on public.profiles from authenticated, anon;
grant update (name, color, visits_target, weight_goal_kg, gym_lat, gym_lng) on public.profiles to authenticated;

do $$
declare t text;
begin
  foreach t in array array['checkins','workouts','weighins','posts','reactions','comments'] loop
    execute format('drop policy if exists "ler do grupo" on public.%I', t);
    execute format('create policy "ler do grupo" on public.%I for select to authenticated using (group_id = public.my_group())', t);
    execute format('drop policy if exists "criar no grupo" on public.%I', t);
    execute format('create policy "criar no grupo" on public.%I for insert to authenticated with check (user_id = auth.uid() and group_id = public.my_group())', t);
    execute format('drop policy if exists "apagar o meu" on public.%I', t);
    execute format('create policy "apagar o meu" on public.%I for delete to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------- tempo real (feed ao vivo) ----------
do $$
begin
  begin alter publication supabase_realtime add table public.posts; exception when others then null; end;
  begin alter publication supabase_realtime add table public.reactions; exception when others then null; end;
  begin alter publication supabase_realtime add table public.comments; exception when others then null; end;
  begin alter publication supabase_realtime add table public.checkins; exception when others then null; end;
end $$;

-- ---------- fotos do feed ----------
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict (id) do nothing;
drop policy if exists "membros enviam fotos" on storage.objects;
create policy "membros enviam fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = public.my_group()::text and (storage.foldername(name))[2] = auth.uid()::text);
