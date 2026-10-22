-- YFX Gym · 004 · Avisos do Supabase (segurança e performance)

-- trigger de novos utilizadores passa para o esquema privado (não fica chamável pela API)
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1), 'Atleta'), 30))
  on conflict (id) do nothing;
  return new;
end $$;
create or replace trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

create or replace function private.no_update() returns trigger language plpgsql set search_path = public as
$$ begin raise exception 'NOT_ALLOWED'; end $$;

-- políticas: auth.uid() avaliado uma vez por pedido, não por linha
alter policy "ver perfis do grupo" on public.profiles
  using (id = (select auth.uid()) or (group_id is not null and group_id = (select public.my_group())));
alter policy "editar o meu perfil" on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy "ver o meu grupo" on public.groups using (id = (select public.my_group()));
alter policy "ler do grupo" on public.weighins using (user_id = (select auth.uid()));
alter policy "ler do grupo" on public.checkins using (group_id = (select public.my_group()));
alter policy "ler do grupo" on public.workouts using (group_id = (select public.my_group()));
alter policy "ler do grupo" on public.posts using (group_id = (select public.my_group()));
alter policy "ler do grupo" on public.reactions using (group_id = (select public.my_group()));
alter policy "ler do grupo" on public.comments using (group_id = (select public.my_group()));
alter policy "apagar o meu" on public.workouts using (user_id = (select auth.uid()));
alter policy "apagar o meu" on public.reactions using (user_id = (select auth.uid()));
alter policy "apagar o meu" on public.comments using (user_id = (select auth.uid()));
alter policy "apagar o meu" on public.posts using (user_id = (select auth.uid()) and kind in ('text', 'photo'));
alter policy "criar no grupo" on public.posts with check (
  user_id = (select auth.uid()) and group_id = (select public.my_group()) and kind in ('text', 'photo')
  and photo_url is null and meta = '{}'::jsonb
  and (photo_path is null or photo_path like (select public.my_group())::text || '/' || (select auth.uid())::text || '/%')
  and (char_length(trim(body)) > 0 or photo_path is not null)
  and (kind = 'photo') = (photo_path is not null));
alter policy "criar no grupo" on public.reactions with check (
  user_id = (select auth.uid()) and group_id = (select public.my_group())
  and exists (select 1 from public.posts p where p.id = post_id and p.group_id = (select public.my_group())));
alter policy "criar no grupo" on public.comments with check (
  user_id = (select auth.uid()) and group_id = (select public.my_group()) and char_length(trim(body)) > 0
  and exists (select 1 from public.posts p where p.id = post_id and p.group_id = (select public.my_group())));

-- índices em falta
create index if not exists comments_user on public.comments (user_id);
create index if not exists comments_group on public.comments (group_id);
create index if not exists posts_user on public.posts (user_id);
create index if not exists profiles_group on public.profiles (group_id);
create index if not exists reactions_user on public.reactions (user_id);
create index if not exists reactions_group on public.reactions (group_id);
create index if not exists groups_created_by on public.groups (created_by);
create index if not exists personal_bests_workout on private.personal_bests (workout_id);
alter table private.join_attempts add column if not exists id bigint generated always as identity primary key;
