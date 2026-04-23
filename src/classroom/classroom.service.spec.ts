import { ConfigService } from '@nestjs/config';
import { ClassroomService } from './classroom.service';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';

describe('ClassroomService', () => {
  const supabaseAdminService = {
    client: {},
  } as SupabaseAdminService;

  const configService = {
    get: jest.fn(),
  } as unknown as ConfigService;

  const service = new ClassroomService(supabaseAdminService, configService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('classifies recruitment posts from numbered labels', () => {
    const result = (service as any).classifyPost(
      { name: 'SW 채용의뢰 3학년' },
      {
        sourceType: 'coursework',
        title: '채용 의뢰 공고',
      },
      '기업명: 미림소프트\n사업자등록번호: 123-45-67890',
    );

    expect(result.kind).toBe('recruitment');
  });

  it('keeps coursework without notice or recruitment signals as unknown', () => {
    const result = (service as any).classifyPost(
      { name: '일반 수업' },
      {
        sourceType: 'coursework',
        title: '과제 제출',
      },
      '과제 제출은 다음 주까지입니다.',
    );

    expect(result.kind).toBe('unknown');
  });

  it('parses recruitment text with numbered labels and multiline values', () => {
    const parsed = (service as any).parseRecruitmentPost(
      [
        '1. 기업명: 미림소프트',
        '2. 사업자등록번호: 123-45-67890',
        '3. 업종: 소프트웨어',
        '4. 사원수: 120명',
        '5. 근무지: 서울시 강남구',
        '6. 웹사이트: https://example.com',
        '7. 담당업무:',
        '백엔드 개발',
        '8. 지원요건:',
        'Node.js 경험',
        '9. 채용인원: 2명',
        '10. 서류제출 마감일: 2026-05-10T18:00:00Z',
        '11. 복리후생: 점심 지원',
      ].join('\n'),
      {
        title: '채용 의뢰',
        sourceType: 'coursework',
        alternateLink: 'https://classroom.google.com/c/test-link',
      },
      { name: 'SW 채용의뢰' },
    );

    expect(parsed.parse_status).toBe('parsed_recruitment');
    expect(parsed.company_name).toBe('미림소프트');
    expect(parsed.headcount).toBe(2);
    expect(parsed.location).toBe('서울시 강남구');
    expect(parsed.job_description).toContain('백엔드 개발');
    expect(parsed.requirements).toContain('Node.js 경험');
    expect(parsed.document_deadline).toBe('2026-05-10T18:00:00.000Z');
  });

  it('keeps announcements and materials when courseWork is forbidden', async () => {
    jest.spyOn(service as any, 'classroomGetPaginated').mockImplementation(
      async (path: string) => {
        if (path.includes('/announcements')) {
          return [
            {
              id: 'announcement-1',
              title: '공지',
              text: '안내 사항입니다.',
            },
          ];
        }

        if (path.includes('/courseWorkMaterials')) {
          return [
            {
              id: 'material-1',
              title: '자료',
              description: '참고 자료입니다.',
            },
          ];
        }

        if (path.includes('/courseWork')) {
          throw new Error('Classroom API request failed: 403');
        }

        if (path.includes('/teachers')) {
          return [
            {
              userId: 'teacher-1',
              profile: {
                name: {
                  fullName: 'Teacher One',
                },
              },
            },
          ];
        }

        return [];
      },
    );

    const posts = await service.fetchCoursePosts('708572935682');

    expect(posts).toHaveLength(2);
    expect(posts.map((post) => post.id)).toEqual([
      'announcement-1',
      'material-1',
    ]);
    expect(posts.map((post) => post.sourceType)).toEqual([
      'announcement',
      'material',
    ]);
  });
});
