-- Perfis (nome + telefone de cada usuário, ligado ao auth.users)
create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  telefone text not null unique,
  created_at timestamptz not null default now()
);

-- Clientes cadastrados por cada usuário
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  empresa text,
  whatsapp text,
  email text,
  servico text,
  valor_mensal numeric not null default 0,
  dia_vencimento integer,
  proximo_vencimento date,
  frequencia text not null default 'mensal',
  forma_pagamento text,
  chave_pix text,
  observacoes text,
  status_cliente text not null default 'ativo',
  pago_neste_ciclo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clientes_user_id_idx on public.clientes(user_id);

-- Histórico de cobranças/pagamentos por cliente
create table public.historico (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  data date,
  valor numeric,
  status text,
  data_pagamento date,
  data_lembrete date,
  canal text,
  observacoes text,
  created_at timestamptz not null default now()
);
create index historico_cliente_id_idx on public.historico(cliente_id);
create index historico_user_id_idx on public.historico(user_id);

-- Modelos de mensagem personalizados por usuário
create table public.templates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  antes5 text,
  antes2 text,
  dia_vencimento text,
  atraso1 text,
  atraso3 text,
  atraso7 text,
  confirmacao text,
  updated_at timestamptz not null default now()
);

-- Limite de 50 clientes por usuário (proteção no banco, além da checagem no app)
create or replace function public.check_client_limit()
returns trigger as $$
begin
  if (select count(*) from public.clientes where user_id = new.user_id) >= 50 then
    raise exception 'Limite de 50 clientes atingido';
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_check_client_limit
before insert on public.clientes
for each row execute function public.check_client_limit();

-- Cria automaticamente o perfil (nome/telefone) quando um novo usuário é criado
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.perfis (id, nome, telefone)
  values (new.id, new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'telefone');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security: cada usuário só acessa os próprios dados
alter table public.perfis enable row level security;
alter table public.clientes enable row level security;
alter table public.historico enable row level security;
alter table public.templates enable row level security;

create policy "perfis_self" on public.perfis
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "clientes_self" on public.clientes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "historico_self" on public.historico
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "templates_self" on public.templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
