개발 기준 문서
이 문서는 현재 프로젝트에서 계속 참고할 수 있도록 요구사항, DB 방향, 권한, 보안 원칙을 한곳에 정리한 개발용 기준 문서다.

1. 서비스 개요
학교 구성원을 대상으로 하는 회원가입, 로그인, 공지사항, 채용 공고, 투표, 포트폴리오, 피드백 기능을 제공한다.
관리자 권한은 회장, 부회장, 선생님 기준으로 구분한다.
학생은 본인 데이터 중심으로 사용하고, 교사/관리자는 별도 권한 정책으로 접근한다.
2. 인증 및 계정 규칙
인증은 Supabase Auth를 사용한다.
사용자 프로필은 public.profiles 테이블에 저장한다.
학교 이메일만 가입 가능하다.
허용 도메인은 e-mirim.hs.kr 이다.
이메일 아이디 형식은 sYY-1부터 sYY-72까지 허용한다.
예: 2025년 입학 기준이면 s25-1@e-mirim.hs.kr 형태
profiles.school_email은 unique로 관리한다.
3. 권한 규칙
학생은 본인 프로필, 본인 포트폴리오, 공지사항, 채용 공고, 투표 결과를 조회한다.
회장/부회장은 관리자 기능 일부를 사용한다.
선생님은 관리자 기능 전체 또는 대부분을 사용한다.
선생님은 학생 포트폴리오를 열람하고 피드백을 남길 수 있다.
권한 제어는 프런트가 아니라 RLS로 강제한다.
4. DB 구조 요약
핵심 테이블
profiles
allowed_email_domains
notices
recruitment_posts
polls
poll_options
poll_votes
poll_vote_items
portfolios
portfolio_feedbacks
audit_logs
추가 제안 테이블
class_point_records
class_point_notifications
5. 테이블 역할
profiles: 사용자 기본 정보와 역할 저장
allowed_email_domains: 가입 허용 도메인 관리
notices: 공지사항 저장
recruitment_posts: 채용 공고 저장
polls: 투표 본문 저장
poll_options: 투표 항목 저장
poll_votes: 투표 참여 기록 저장
poll_vote_items: 복수 선택 상세 저장
portfolios: 포트폴리오 업로드 메타데이터 저장
portfolio_feedbacks: 선생님 피드백 저장
audit_logs: 관리자 작업 이력 저장
class_point_records: 칭찬 스티커/상점/벌점 기록
class_point_notifications: 상벌점 알림 기록
6. 보안 원칙
모든 핵심 테이블은 RLS를 켠다.
프런트엔드 버튼 숨김만으로 권한을 판단하지 않는다.
service role key는 절대 프런트엔드에 노출하지 않는다.
포트폴리오 파일은 Supabase Storage private bucket에 저장한다.
업로드 파일은 크기와 형식을 검사한다.
삭제는 가능하면 soft delete를 우선한다.
관리자 작업은 audit_logs에 남긴다.
7. 투표 규칙
투표는 polls, poll_options, poll_votes, poll_vote_items로 구성한다.
단일 선택과 복수 선택을 allow_multiple로 구분한다.
익명 투표는 화면에서만 익명으로 보이게 하고, 내부 저장은 유지한다.
한 사용자는 같은 투표에 중복 참여하지 못하게 막는다.
8. 포트폴리오 규칙
학생은 본인 포트폴리오를 업로드할 수 있다.
파일 크기 기준은 10MB~20MB 정책을 따를 수 있다.
파일은 Storage에 저장하고 DB에는 경로와 메타데이터만 저장한다.
선생님은 포트폴리오를 열람하고 피드백을 작성한다.
9. 공지사항 및 채용 공고
공지사항은 관리자만 등록할 수 있다.
채용 공고도 관리자만 등록할 수 있다.
학생은 조회만 가능하다.
10. 학급 상벌점 / 칭찬 스티커
칭찬 스티커, 상점, 벌점을 하나의 기록 테이블로 관리한다.
기록에는 대상 학생, 부여 교사, 사유, 점수, 생성 시간이 포함된다.
학생은 본인 내역과 누적 점수를 확인한다.
교사는 기록을 등록, 수정, 삭제할 수 있다.
11. 구현 순서
Supabase Auth 연결
profiles와 이메일 도메인 검증 구성
핵심 테이블 생성
RLS 정책 작성
Storage bucket 생성
프런트엔드 화면 연결
샘플 데이터로 테스트
12. 지금 개발할 때 기억할 포인트
DB 스키마 변경은 먼저 문서에 반영한다.
권한은 코드보다 DB 정책이 우선이다.
익명 투표와 중복 방지는 같이 설계해야 한다.
포트폴리오 파일은 반드시 private로 운영한다.
학교 이메일 규칙은 가입 시점에 강하게 검증한다.