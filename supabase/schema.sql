-- Run in the Supabase SQL editor (safe to run again after app updates).
-- Each record is stored as JSON and synced last-writer-wins by updated_at.
-- Row level security keeps each user's data private.
do $$
declare t text;
begin
  foreach t in array array['trades', 'alerts', 'accounts', 'days', 'setups', 'prefs'] loop
    execute format('create table if not exists %I (
      id text not null,
      user_id uuid not null references auth.users on delete cascade default auth.uid(),
      data jsonb not null,
      updated_at timestamptz not null
    )', t);
    -- Records are keyed per user, so ids like a date or "prefs" never collide between users.
    execute format('alter table %I drop constraint if exists %I', t, t || '_pkey');
    execute format('alter table %I add primary key (user_id, id)', t);
    execute format('create index if not exists %I on %I (user_id, updated_at)', t || '_user_updated', t);
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', 'own ' || t, t);
    execute format('create policy %I on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', 'own ' || t, t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;
