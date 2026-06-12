-- ============================================
-- BOLÃO DA COPA — Schema Supabase
-- Cole tudo no SQL Editor do Supabase e execute
-- ============================================

-- Perfis (criado automaticamente no cadastro)
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  is_admin boolean not null default false,
  created_at timestamptz default now()
);

-- Jogos
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  home text not null,
  away text not null,
  kickoff timestamptz,
  locked boolean not null default false,
  res_home int,
  res_away int,
  res_cards int,
  created_at timestamptz default now()
);

-- Palpites
create table public.bets (
  user_id uuid references public.profiles(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  home int not null,
  away int not null,
  cards int not null,
  updated_at timestamptz default now(),
  primary key (user_id, match_id)
);

-- Pontuação configurável
create table public.settings (
  id int primary key default 1,
  pts_exact int not null default 5,
  pts_outcome int not null default 3,
  pts_cards int not null default 2
);
insert into public.settings (id) values (1);

-- Cria perfil automaticamente quando alguém se cadastra
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'Sem nome'));
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists(select 1 from profiles where id = auth.uid() and is_admin) $$;

create function public.match_open(mid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(
     select 1 from matches m
     where m.id = mid
       and not m.locked
       and m.res_home is null
       and (m.kickoff is null or m.kickoff > now())
   ) $$;

-- Segurança (RLS)
alter table public.profiles enable row level security;
alter table public.matches  enable row level security;
alter table public.bets     enable row level security;
alter table public.settings enable row level security;

create policy "perfis visiveis a todos logados"
  on public.profiles for select to authenticated using (true);

create policy "editar proprio perfil"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and is_admin = is_admin());

create policy "jogos visiveis"
  on public.matches for select to authenticated using (true);

create policy "admin gerencia jogos"
  on public.matches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Palpite dos outros só aparece depois que o jogo fecha
create policy "ver palpites"
  on public.bets for select to authenticated
  using (user_id = auth.uid() or not public.match_open(match_id));

create policy "criar palpite enquanto aberto"
  on public.bets for insert to authenticated
  with check (user_id = auth.uid() and public.match_open(match_id));

create policy "editar palpite enquanto aberto"
  on public.bets for update to authenticated
  using (user_id = auth.uid() and public.match_open(match_id))
  with check (user_id = auth.uid() and public.match_open(match_id));

create policy "config visivel"
  on public.settings for select to authenticated using (true);

create policy "admin edita config"
  on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================
-- DEPOIS DE SE CADASTRAR NO SITE, rode isto
-- para virar admin (troque pelo seu e-mail):
--
-- update public.profiles set is_admin = true
-- where id = (select id from auth.users where email = 'seu@email.com');
-- ============================================
