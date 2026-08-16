-- TF 트랙 (Day 90 대리 이후 4개 전문 트랙)
-- Supabase SQL Editor에서 실행
alter table users add column if not exists tf_track text;            -- 현재 트랙 id (nego|people|docs|meeting)
alter table users add column if not exists tf_started_at timestamptz; -- 현재 트랙 시작 시각
alter table users add column if not exists tf_done jsonb default '[]'::jsonb; -- 완주한 트랙 id 배열
