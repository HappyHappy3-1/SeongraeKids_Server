-- Add optional event_date to notices so they can appear on the calendar timeline.
alter table public.notices
  add column if not exists event_date date null;
