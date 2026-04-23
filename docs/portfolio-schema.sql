-- Required Supabase schema for portfolio APIs.
-- Run in Supabase SQL editor (adjust names if your project already has these tables).

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('student', 'teacher', 'homeroom_teacher')),
  created_at timestamptz not null default now()
);

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users (id) on delete cascade,
  file_path text not null unique,
  original_name text not null,
  mime_type text not null default 'application/pdf',
  size integer not null check (size > 0),
  uploaded_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "portfolios_students_select_own" on public.portfolios;
create policy "portfolios_students_select_own"
on public.portfolios
for select
to authenticated
using (student_id = auth.uid());

drop policy if exists "portfolios_students_insert_own" on public.portfolios;
create policy "portfolios_students_insert_own"
on public.portfolios
for insert
to authenticated
with check (student_id = auth.uid());

drop policy if exists "portfolios_teachers_select_all" on public.portfolios;
create policy "portfolios_teachers_select_all"
on public.portfolios
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('teacher', 'homeroom_teacher')
  )
);

-- Storage bucket (private) + policies for file access.
insert into storage.buckets (id, name, public)
values ('portfolios', 'portfolios', false)
on conflict (id) do nothing;

drop policy if exists "storage_students_upload_own" on storage.objects;
create policy "storage_students_upload_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'portfolios'
  and split_part(name, '/', 2) = auth.uid()::text
);

drop policy if exists "storage_students_read_own" on storage.objects;
create policy "storage_students_read_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'portfolios'
  and split_part(name, '/', 2) = auth.uid()::text
);

drop policy if exists "storage_teachers_read_all" on storage.objects;
create policy "storage_teachers_read_all"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'portfolios'
  and exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role in ('teacher', 'homeroom_teacher')
  )
);
