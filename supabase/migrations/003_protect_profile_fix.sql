-- YFX Gym · 003 · Correção encontrada no teste da auditoria
-- O bloqueio de group_id/avatar usava uma flag de sessão que ficava ligada até ao fim da transação.
-- Agora o trigger corre como o utilizador que faz o pedido: só as funções do servidor (que correm
-- como dono da base de dados) podem mudar o grupo ou o avatar.

create or replace function private.protect_profile() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id or new.group_id is distinct from old.group_id
       or new.avatar_path is distinct from old.avatar_path or new.created_at is distinct from old.created_at then
      raise exception 'NOT_ALLOWED';
    end if;
  end if;
  new.gym_lat := null; new.gym_lng := null;
  new.name := left(trim(new.name), 30);
  if char_length(new.name) = 0 then raise exception 'BAD_NAME'; end if;
  if new.color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'BAD_COLOR'; end if;
  if new.weight_goal_kg not in (-1, -0.5, 0, 0.25, 0.5) then raise exception 'BAD_GOAL'; end if;
  return new;
end $$;
