-- U16: shared category names come from the current database catalog.
create table public.content_categories (
  scope text not null check (scope in ('challenge', 'material')),
  name text not null check (length(btrim(name)) between 1 and 100 and name = btrim(name)),
  created_at timestamptz not null default now(),
  primary key (scope, name)
);

create unique index content_categories_scope_name_ci_idx
  on public.content_categories (scope, lower(name));

insert into public.content_categories (scope, name)
select 'challenge', category from public.challenges
where btrim(category) <> ''
group by category;

insert into public.content_categories (scope, name)
select 'material', category from public.materials
where btrim(category) <> ''
group by category;

alter table public.content_categories enable row level security;

create policy content_categories_select on public.content_categories
  for select to authenticated using (true);

create policy content_categories_insert on public.content_categories
  for insert to authenticated with check (private.is_admin());

grant select, insert on public.content_categories to authenticated;

alter publication supabase_realtime add table public.content_categories;
