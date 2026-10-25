-- Run once in the Supabase SQL editor. Each record is stored as JSON and
-- synced last-writer-wins by updated_at. Row level security keeps each user's data private.
create table if not exists trades (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  data jsonb not null,
  updated_at timestamptz not null
);
create table if not exists alerts (like trades including all);
alter table alerts add constraint alerts_user_fk foreign key (user_id) references auth.users on delete cascade;
create table if not exists accounts (like trades including all);
alter table accounts add constraint accounts_user_fk foreign key (user_id) references auth.users on delete cascade;

create index if not exists trades_user_updated on trades (user_id, updated_at);
create index if not exists alerts_user_updated on alerts (user_id, updated_at);
create index if not exists accounts_user_updated on accounts (user_id, updated_at);

alter table trades enable row level security;
alter table alerts enable row level security;
alter table accounts enable row level security;
create policy "own trades" on trades for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own alerts" on alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own accounts" on accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on trades, alerts, accounts to authenticated;
