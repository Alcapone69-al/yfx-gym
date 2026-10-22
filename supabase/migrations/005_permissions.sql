-- YFX Gym · 005 · Permissões mínimas (defesa em profundidade, para além das regras RLS)
-- Visitantes sem sessão (anon) não têm acesso a nada; utilizadores com sessão só escrevem
-- diretamente texto/fotos/reações/comentários. Tudo o resto passa pelas funções do servidor.

revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.checkins, public.workouts, public.weighins, public.groups from authenticated;
revoke insert, update, delete on public.profiles from authenticated;
grant update (name, color, visits_target, weight_goal_kg) on public.profiles to authenticated;
revoke update on public.posts, public.reactions, public.comments from authenticated;
revoke truncate, references, trigger on all tables in schema public from authenticated;

revoke execute on function public.check_in(float8, float8, float8), public.set_gym_and_check_in(float8, float8, float8),
  public.my_gym(), public.my_weight(), public.log_weight(numeric), public.finish_workout(uuid, text, jsonb),
  public.set_avatar(text), public.create_group(text), public.join_group(text), public.leave_group(),
  public.rotate_invite(), public.remove_member(uuid), public.week_ranking(int), public.group_bests(text[]),
  public.my_bests(text[]), public.my_week_target(), public.my_group(), public.handle_new_user() from public, anon;
revoke execute on function public.handle_new_user() from authenticated;

-- (as colunas antigas profiles.gym_lat/gym_lng e posts.photo_url ficam sem uso e sem permissão de escrita;
--  apagar com: alter table public.profiles drop column gym_lat, drop column gym_lng;
--              alter policy ... sem photo_url; alter table public.posts drop column photo_url;
--              drop function public.handle_new_user();)
