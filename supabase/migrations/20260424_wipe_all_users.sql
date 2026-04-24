-- ⚠️ 경고: 이 스크립트는 모든 가입 유저와 관련 데이터(프로필/포트폴리오/공지/공고/투표/피드백)를 전부 삭제합니다.
-- Supabase Dashboard > SQL Editor 에서 한 번만 실행하세요.

begin;

-- 1. public 테이블의 유저 연관 데이터 우선 정리 (FK CASCADE가 있지만 명시)
delete from public.portfolio_feedbacks;
delete from public.portfolios;
delete from public.poll_votes;
delete from public.poll_vote_items;
delete from public.poll_options;
delete from public.polls;
delete from public.notices;
delete from public.recruitment_posts;
delete from public.class_point_notifications;
delete from public.class_point_records;
delete from public.profiles;

-- 2. Supabase auth.users 삭제 (service role 권한 필요 — Dashboard SQL Editor 는 superuser)
delete from auth.users;

commit;
