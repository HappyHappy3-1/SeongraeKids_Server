import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseAdminService } from '../supabase/supabase-admin.service';
import { CLASSROOM_API_BASE_URL } from './classroom.constants';

type ClassroomCourse = {
  id?: string;
  name?: string;
  courseState?: string;
  updateTime?: string;
};

type ClassroomTeacher = {
  userId?: string;
  profile?: {
    name?: {
      fullName?: string;
    };
  };
};

type ClassroomPost = {
  id?: string;
  courseId?: string;
  courseWorkType?: string;
  title?: string;
  text?: string;
  description?: string;
  materials?: unknown[];
  ownerId?: string;
  creatorUserId?: string;
  updateTime?: string;
  creationTime?: string;
  dueDate?: { year?: number; month?: number; day?: number };
  dueTime?: { hours?: number; minutes?: number; seconds?: number };
  maxPoints?: number;
  alternateLink?: string;
  sourceType?: 'announcement' | 'coursework' | 'material';
};

type RawPostRow = {
  id: string;
  course_id: string;
  course_name: string;
  classroom_post_id: string;
  post_type: string;
  title: string | null;
  content: string | null;
  teacher_name: string | null;
  due_at: string | null;
  max_points: number | null;
  raw_json: unknown;
  parse_status: string;
  linked_notice_id: string | null;
  linked_recruitment_post_id: string | null;
};

type RawPostRecord = Omit<
  RawPostRow,
  'id' | 'linked_notice_id' | 'linked_recruitment_post_id'
> & {
  parse_status: 'pending' | 'parsed_notice' | 'parsed_recruitment' | 'failed' | 'unknown' | 'partial_recruitment';
  linked_notice_id?: string | null;
  linked_recruitment_post_id?: string | null;
};

type RecruitmentParseResult = {
  company_name: string;
  headcount: number;
  location: string;
  classroom_link: string | null;
  military_service_available: boolean;
  business_registration_number: string | null;
  industry: string | null;
  employee_count: number | null;
  revenue_scale: string | null;
  website_url: string | null;
  job_description: string | null;
  requirements: string | null;
  recommendation_target: string | null;
  document_deadline: string | null;
  benefits: string | null;
  parse_status: 'parsed_recruitment' | 'partial_recruitment' | 'failed';
  parse_reason: string | null;
};

type SyncResult =
  | {
      kind: 'notice';
      rawPostId: string;
      noticeId: string;
      classification: 'notice';
      skipped?: false;
    }
  | {
      kind: 'recruitment';
      rawPostId: string;
      recruitmentPostId: string;
      classification: 'recruitment';
      parseStatus: RecruitmentParseResult['parse_status'];
      skipped?: false;
    }
  | {
      kind: 'unknown';
      rawPostId: string;
      classification: 'unknown';
      skipped?: false;
    }
  | {
      kind: 'skipped';
      rawPostId?: string;
      reason: string;
      skipped: true;
    };

type SyncWarning = {
  courseId: string;
  endpoint: string;
  message: string;
};

@Injectable()
export class ClassroomService {
  private readonly logger = new Logger(ClassroomService.name);
  private actorProfileIdPromise: Promise<string> | null = null;

  constructor(
    private readonly supabaseAdminService: SupabaseAdminService,
    private readonly configService: ConfigService,
  ) {}

  async syncAll(courseIds?: string[], dryRun = false) {
    if (!dryRun) {
      this.ensureWriteCredentials();
    }

    const warnings: SyncWarning[] = [];
    const courses = await this.fetchCourses();
    const filteredCourses = courseIds?.length
      ? courses.filter((course) => course.id && courseIds.includes(course.id))
      : courses;

    const results: SyncResult[] = [];

    for (const course of filteredCourses) {
      if (!course.id || !course.name) {
        continue;
      }

      const teacherNameMap = await this.fetchTeacherNameMap(course.id, warnings);
      const posts = await this.fetchCoursePosts(course.id, warnings);

      for (const post of posts) {
        const result = await this.persistPost(course, post, teacherNameMap, dryRun);
        results.push(result);
      }
    }

    return {
      courses: filteredCourses.length,
      posts: results.length,
      notices: results.filter((result) => result.kind === 'notice').length,
      recruitments: results.filter((result) => result.kind === 'recruitment').length,
      unknown: results.filter((result) => result.kind === 'unknown').length,
      skipped: results.filter((result) => result.kind === 'skipped').length,
      warnings,
      results,
    };
  }

  async fetchCourses(): Promise<ClassroomCourse[]> {
    const response = await this.classroomGetPaginated<ClassroomCourse>(
      '/courses',
      'courses',
      {
        courseStates: 'ACTIVE',
        pageSize: 100,
      },
    );

    return response;
  }

  async fetchCoursePosts(
    courseId: string,
    warnings: SyncWarning[] = [],
  ): Promise<ClassroomPost[]> {
    const [announcements, courseWorks, materials] = await Promise.all([
      this.safeClassroomGetPaginated<ClassroomPost>(
        courseId,
        'announcements',
        `/courses/${courseId}/announcements`,
        'announcements',
        { pageSize: 100 },
        warnings,
      ),
      this.safeClassroomGetPaginated<ClassroomPost>(
        courseId,
        'courseWork',
        `/courses/${courseId}/courseWork`,
        'courseWork',
        { pageSize: 100 },
        warnings,
      ),
      this.safeClassroomGetPaginated<ClassroomPost>(
        courseId,
        'courseWorkMaterials',
        `/courses/${courseId}/courseWorkMaterials`,
        'courseWorkMaterial',
        { pageSize: 100 },
        warnings,
      ),
    ]);

    return [
      ...announcements.map((item) => ({
        ...item,
        sourceType: 'announcement' as const,
      })),
      ...courseWorks.map((item) => ({
        ...item,
        sourceType: 'coursework' as const,
      })),
      ...materials.map((item) => ({
        ...item,
        sourceType: 'material' as const,
      })),
    ];
  }

  private async fetchTeacherNameMap(
    courseId: string,
    warnings: SyncWarning[] = [],
  ) {
    const teachers = await this.safeClassroomGetPaginated<ClassroomTeacher>(
      courseId,
      'teachers',
      `/courses/${courseId}/teachers`,
      'teachers',
      { pageSize: 100 },
      warnings,
    );

    const map = new Map<string, string>();
    for (const teacher of teachers) {
      const userId = teacher.userId;
      const fullName = teacher.profile?.name?.fullName;
      if (userId && fullName) {
        map.set(userId, fullName);
      }
    }

    return map;
  }

  private async safeClassroomGetPaginated<T extends Record<string, unknown>>(
    courseId: string,
    endpoint: string,
    path: string,
    listKey: string,
    query: Record<string, string | number | boolean> = {},
    warnings: SyncWarning[] = [],
  ): Promise<T[]> {
    try {
      return await this.classroomGetPaginated<T>(path, listKey, query);
    } catch (error) {
      const message = this.describeClassroomError(error);
      this.logger.warn(
        `Skipping ${endpoint} for courseId=${courseId}: ${message}`,
      );
      warnings.push({
        courseId,
        endpoint,
        message,
      });
      return [];
    }
  }

  private describeClassroomError(error: unknown) {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (typeof response === 'string') {
        return response;
      }

      if (response && typeof response === 'object') {
        const responseMessage = (response as Record<string, unknown>).message;
        if (typeof responseMessage === 'string') {
          return responseMessage;
        }
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown Classroom API error';
  }

  private async persistPost(
    course: ClassroomCourse,
    post: ClassroomPost,
    teacherNameMap: Map<string, string>,
    dryRun: boolean,
  ): Promise<SyncResult> {
    const classroomPostId = post.id;
    if (!classroomPostId) {
      return { kind: 'skipped', skipped: true, reason: 'missing_post_id' };
    }

    const content = this.extractContent(post);
    const dueAt = this.buildDueAt(post);
    const teacherName = this.resolveTeacherName(post, teacherNameMap);
    const classification = this.classifyPost(course, post, content);
    const sourceUpdatedAt = post.updateTime ?? post.creationTime ?? null;

    const existingRaw = await this.findRawPost(course.id ?? '', classroomPostId);
    if (
      existingRaw &&
      this.isSameSourceVersion(existingRaw, sourceUpdatedAt) &&
      this.isFinalParseStatus(existingRaw.parse_status) &&
      existingRaw.linked_notice_id &&
      existingRaw.parse_status === 'parsed_notice'
    ) {
      return {
        kind: 'skipped',
        skipped: true,
        reason: 'unchanged_notice',
        rawPostId: existingRaw.id,
      };
    }

    if (
      existingRaw &&
      this.isSameSourceVersion(existingRaw, sourceUpdatedAt) &&
      this.isFinalParseStatus(existingRaw.parse_status) &&
      existingRaw.linked_recruitment_post_id &&
      existingRaw.parse_status === 'parsed_recruitment'
    ) {
      return {
        kind: 'skipped',
        skipped: true,
        reason: 'unchanged_recruitment',
        rawPostId: existingRaw.id,
      };
    }

    const rawRecord: RawPostRecord = {
      course_id: course.id ?? '',
      course_name: course.name ?? '',
      classroom_post_id: classroomPostId,
      post_type: classification.postType,
      title: this.normalizeTitle(post.title),
      content,
      teacher_name: teacherName,
      due_at: dueAt,
      max_points: this.normalizeNumber(post.maxPoints),
      raw_json: post,
      parse_status: 'pending',
      linked_notice_id: null,
      linked_recruitment_post_id: null,
    };

    if (dryRun) {
      return {
        kind: classification.kind,
        rawPostId: existingRaw?.id ?? classroomPostId,
        classification: classification.kind,
        skipped: false,
        ...(classification.kind === 'recruitment'
          ? {
              recruitmentPostId: 'dry-run',
              parseStatus: 'failed' as const,
            }
          : classification.kind === 'notice'
            ? { noticeId: 'dry-run' }
            : {}),
      } as SyncResult;
    }

    const rawPostId = await this.upsertRawPost(rawRecord);

    if (classification.kind === 'notice') {
      const noticeId = await this.upsertNotice({
        title: this.normalizeTitle(post.title),
        content: content ?? this.normalizeTitle(post.title),
        published_at: post.creationTime ?? post.updateTime ?? new Date().toISOString(),
        created_by: await this.resolveActorProfileId(),
        source_type: 'classroom',
        classroom_raw_post_id: rawPostId,
      });

      await this.updateRawPostStatus(rawPostId, {
        parse_status: 'parsed_notice',
        linked_notice_id: noticeId,
        linked_recruitment_post_id: null,
      });

      return {
        kind: 'notice',
        rawPostId,
        noticeId,
        classification: 'notice',
      };
    }

    if (classification.kind === 'recruitment') {
      const parsed = this.parseRecruitmentPost(content, post, course);

      if (parsed.parse_status === 'failed') {
        await this.updateRawPostStatus(rawPostId, {
          parse_status: 'failed',
        });

        this.logger.warn(
          `Recruitment parse failed for classroom_post_id=${classroomPostId}: ${parsed.parse_reason ?? 'unknown reason'}`,
        );

        return {
          kind: 'unknown',
          rawPostId,
          classification: 'unknown',
        };
      }

      const recruitmentPostId = await this.upsertRecruitmentPost({
        company_name: parsed.company_name,
        headcount: parsed.headcount,
        location: parsed.location,
        classroom_link: post.alternateLink ?? null,
        military_service_available: parsed.military_service_available,
        created_by: await this.resolveActorProfileId(),
        source_type: 'classroom',
        classroom_raw_post_id: rawPostId,
        business_registration_number: parsed.business_registration_number,
        industry: parsed.industry,
        employee_count: parsed.employee_count,
        revenue_scale: parsed.revenue_scale,
        website_url: parsed.website_url,
        job_description: parsed.job_description,
        requirements: parsed.requirements,
        recommendation_target: parsed.recommendation_target,
        document_deadline: parsed.document_deadline,
        benefits: parsed.benefits,
      });

      await this.updateRawPostStatus(rawPostId, {
        parse_status:
          parsed.parse_status === 'partial_recruitment'
            ? 'partial_recruitment'
            : 'parsed_recruitment',
        linked_notice_id: null,
        linked_recruitment_post_id: recruitmentPostId,
      });

      return {
        kind: 'recruitment',
        rawPostId,
        recruitmentPostId,
        classification: 'recruitment',
        parseStatus: parsed.parse_status,
      };
    }

    await this.updateRawPostStatus(rawPostId, {
      parse_status: 'unknown',
      linked_notice_id: null,
      linked_recruitment_post_id: null,
    });

    return {
      kind: 'unknown',
      rawPostId,
      classification: 'unknown',
    };
  }

  private async findRawPost(courseId: string, classroomPostId: string) {
    const { data, error } = await this.supabaseAdminService.client
      .from('classroom_raw_posts')
      .select(
        'id,course_id,course_name,classroom_post_id,post_type,title,content,teacher_name,due_at,max_points,raw_json,parse_status,linked_notice_id,linked_recruitment_post_id',
      )
      .eq('course_id', courseId)
      .eq('classroom_post_id', classroomPostId)
      .maybeSingle<RawPostRow>();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data ?? null;
  }

  private async upsertRawPost(rawRecord: RawPostRecord) {
    const { data, error } = await this.supabaseAdminService.client
      .from('classroom_raw_posts')
      .upsert(rawRecord, {
        onConflict: 'course_id,classroom_post_id',
      })
      .select('id')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data.id as string;
  }

  private async upsertNotice(notice: Record<string, unknown>) {
    const { data, error } = await this.supabaseAdminService.client
      .from('notices')
      .upsert(notice, {
        onConflict: 'classroom_raw_post_id',
      })
      .select('id')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data.id as string;
  }

  private async upsertRecruitmentPost(post: Record<string, unknown>) {
    const { data, error } = await this.supabaseAdminService.client
      .from('recruitment_posts')
      .upsert(post, {
        onConflict: 'classroom_raw_post_id',
      })
      .select('id')
      .single();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return data.id as string;
  }

  private async updateRawPostStatus(
    rawPostId: string,
    patch: Partial<Pick<RawPostRecord, 'parse_status' | 'linked_notice_id' | 'linked_recruitment_post_id'>>,
  ) {
    const { error } = await this.supabaseAdminService.client
      .from('classroom_raw_posts')
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rawPostId);

    if (error) {
      throw new BadRequestException(error.message);
    }
  }

  private classifyPost(
    course: ClassroomCourse,
    post: ClassroomPost,
    content: string | null,
  ) {
    const courseName = (course.name ?? '').toLowerCase();
    const text = `${courseName}\n${post.title ?? ''}\n${content ?? ''}`.toLowerCase();
    const recruitmentKeywords = [
      '채용의뢰',
      '취업',
      '기업명',
      '사업자등록번호',
      '업종',
      '사원수',
      '지원요건',
      '병역 특례',
      '병역특례',
      '복리후생',
      '채용인원',
      '서류제출 마감일',
      '모집인원',
      '근무지',
    ];

    const recruitmentScore = recruitmentKeywords.reduce(
      (score, keyword) => (text.includes(keyword.toLowerCase()) ? score + 1 : score),
      0,
    );

    if (
      courseName.includes('채용의뢰') ||
      courseName.includes('취업') ||
      courseName.includes('sw') ||
      recruitmentScore >= 2
    ) {
      return { kind: 'recruitment' as const, postType: this.normalizePostType(post.sourceType) };
    }

    if (post.sourceType === 'announcement' || post.sourceType === 'material') {
      return { kind: 'notice' as const, postType: this.normalizePostType(post.sourceType) };
    }

    const noticeSignals = ['공지', '안내', '설문', '일정', '신청', '설명회', '공지사항'];
    const noticeScore = noticeSignals.reduce(
      (score, keyword) => (text.includes(keyword.toLowerCase()) ? score + 1 : score),
      0,
    );

    if (noticeScore >= 1) {
      return { kind: 'notice' as const, postType: this.normalizePostType(post.sourceType) };
    }

    return { kind: 'unknown' as const, postType: this.normalizePostType(post.sourceType) };
  }

  private parseRecruitmentPost(
    content: string | null,
    post: ClassroomPost,
    course: ClassroomCourse,
  ): RecruitmentParseResult {
    const lines = (content ?? '')
      .split(/\r?\n/)
      .map((line) => this.normalizeLine(line))
      .filter(Boolean);

    const fields: Record<string, string> = {};
    let currentKey: string | null = null;

    const labelDefinitions: Array<{ key: keyof Omit<RecruitmentParseResult, 'parse_status' | 'parse_reason' | 'headcount' | 'military_service_available'>; labels: string[] }> = [
      { key: 'company_name', labels: ['기업명', '회사명'] },
      { key: 'business_registration_number', labels: ['사업자등록번호'] },
      { key: 'industry', labels: ['업종'] },
      { key: 'employee_count', labels: ['사원수'] },
      { key: 'revenue_scale', labels: ['매출규모'] },
      { key: 'location', labels: ['근무지', '주소'] },
      { key: 'website_url', labels: ['웹사이트', '홈페이지', 'URL'] },
      { key: 'job_description', labels: ['담당업무', '주요업무'] },
      { key: 'requirements', labels: ['지원요건', '자격요건', '우대사항'] },
      { key: 'recommendation_target', labels: ['추천대상'] },
      { key: 'document_deadline', labels: ['서류제출 마감일', '서류 마감일', '마감일'] },
      { key: 'benefits', labels: ['복리후생'] },
    ];

    const militaryLabels = ['병역 특례', '병역특례', '병역특례 여부'];
    const hiringLabels = ['채용인원', '모집인원', '인원'];

    for (const line of lines) {
      const normalizedLine = this.stripLeadingNumbering(line);

      const militaryMatch = this.matchLabelLine(normalizedLine, militaryLabels);
      if (militaryMatch) {
        fields.military_service_available = militaryMatch.value;
        currentKey = 'military_service_available';
        continue;
      }

      const hiringMatch = this.matchLabelLine(normalizedLine, hiringLabels);
      if (hiringMatch) {
        fields.hiring_count = hiringMatch.value;
        currentKey = 'hiring_count';
        continue;
      }

      const matchedLabel = labelDefinitions.find((definition) =>
        definition.labels.some((label) => this.matchLabelLine(normalizedLine, [label])),
      );

      if (matchedLabel) {
        const match = this.matchLabelLine(normalizedLine, matchedLabel.labels);
        if (match) {
          fields[matchedLabel.key] = match.value;
          currentKey = matchedLabel.key;
          continue;
        }
      }

      if (currentKey) {
        fields[currentKey] = `${fields[currentKey] ? `${fields[currentKey]}\n` : ''}${normalizedLine}`.trim();
      }
    }

    const recognizedFieldCount = Object.entries(fields).filter(([, value]) => Boolean(value?.trim())).length;
    const companyName = this.normalizeTitle(
      fields.company_name ??
        this.extractCompanyName(post.title, content) ??
        course.name ??
        '미상',
    );
    const headcount = this.parsePositiveInteger(fields.hiring_count) ?? 1;
    const location = this.normalizeTitle(
      fields.location ??
        this.extractLocationFromContent(content) ??
        course.name ??
        '미상',
    );
    const documentDeadline = this.parseDeadline(fields.document_deadline);
    const militaryServiceAvailable = this.parseBooleanish(
      fields.military_service_available,
    );

    if (recognizedFieldCount === 0) {
      return {
        company_name: companyName,
        headcount,
        location,
        classroom_link: post.alternateLink ?? null,
        military_service_available: militaryServiceAvailable,
        business_registration_number: null,
        industry: null,
        employee_count: null,
        revenue_scale: null,
        website_url: null,
        job_description: null,
        requirements: null,
        recommendation_target: null,
        document_deadline: null,
        benefits: null,
        parse_status: 'failed',
        parse_reason: 'no recognizable recruitment labels were found',
      };
    }

    const missingCoreFields = [
      companyName ? null : 'company_name',
      headcount ? null : 'headcount',
      location ? null : 'location',
      documentDeadline ? null : 'document_deadline',
      fields.job_description ? null : 'job_description',
      fields.requirements ? null : 'requirements',
    ].filter(Boolean);

    const parseStatus =
      missingCoreFields.length > 0
        ? 'partial_recruitment'
        : 'parsed_recruitment';

    return {
      company_name: companyName,
      headcount,
      location,
      classroom_link: post.alternateLink ?? null,
      military_service_available: militaryServiceAvailable,
      business_registration_number: this.normalizeOptionalText(
        fields.business_registration_number,
      ),
      industry: this.normalizeOptionalText(fields.industry),
      employee_count: this.parsePositiveInteger(fields.employee_count),
      revenue_scale: this.normalizeOptionalText(fields.revenue_scale),
      website_url: this.normalizeOptionalText(fields.website_url),
      job_description: this.normalizeOptionalText(fields.job_description),
      requirements: this.normalizeOptionalText(fields.requirements),
      recommendation_target: this.normalizeOptionalText(fields.recommendation_target),
      document_deadline: documentDeadline,
      benefits: this.normalizeOptionalText(fields.benefits),
      parse_status: parseStatus,
      parse_reason:
        parseStatus === 'partial_recruitment'
          ? `missing core fields: ${missingCoreFields.join(', ')}`
          : null,
    };
  }

  private async classroomGetPaginated<T extends Record<string, unknown>>(
    path: string,
    listKey: string,
    query: Record<string, string | number | boolean> = {},
  ): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        params.set(key, String(value));
      }
      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      const suffix = params.toString() ? `?${params.toString()}` : '';
      const response = await this.classroomGet<{
        nextPageToken?: string;
        [key: string]: unknown;
      }>(`${path}${suffix}`);

      const pageItems = response[listKey];
      if (Array.isArray(pageItems)) {
        items.push(...(pageItems as T[]));
      }

      pageToken = response.nextPageToken;
    } while (pageToken);

    return items;
  }

  private async classroomGet<T>(path: string): Promise<T> {
    const accessToken = await this.resolveAccessToken();

    const response = await fetch(`${CLASSROOM_API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`Classroom API error ${response.status}: ${text}`);
      throw new BadRequestException(
        `Classroom API request failed: ${response.status} ${text.slice(0, 200)}`,
      );
    }

    return (await response.json()) as T;
  }

  private async resolveAccessToken() {
    const accessToken = this.configService.get<string>(
      'GOOGLE_CLASSROOM_ACCESS_TOKEN',
    );

    if (accessToken) {
      return accessToken;
    }

    const refreshToken = this.configService.get<string>(
      'GOOGLE_CLASSROOM_REFRESH_TOKEN',
    );
    const clientId =
      this.configService.get<string>('GOOGLE_CLASSROOM_CLIENT_ID') ??
      this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret =
      this.configService.get<string>('GOOGLE_CLASSROOM_CLIENT_SECRET') ??
      this.configService.get<string>('GOOGLE_OAUTH_CLIENT_SECRET');

    if (!refreshToken || !clientId || !clientSecret) {
      throw new BadRequestException(
        'GOOGLE_CLASSROOM_ACCESS_TOKEN is required, or provide GOOGLE_CLASSROOM_REFRESH_TOKEN + GOOGLE_CLASSROOM_CLIENT_ID + GOOGLE_CLASSROOM_CLIENT_SECRET for automatic refresh.',
      );
    }

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      throw new BadRequestException(
        `Failed to refresh Google access token: ${tokenResponse.status} ${text.slice(0, 200)}`,
      );
    }

    const payload = (await tokenResponse.json()) as { access_token?: string };
    if (!payload.access_token) {
      throw new BadRequestException(
        'Google token refresh succeeded without an access_token in the response.',
      );
    }

    return payload.access_token;
  }

  private async resolveActorProfileId() {
    const configuredProfileId = this.configService.get<string>(
      'CLASSROOM_SYNC_ACTOR_PROFILE_ID',
    );

    if (!configuredProfileId) {
      throw new BadRequestException(
        'CLASSROOM_SYNC_ACTOR_PROFILE_ID is required so notices and recruitment_posts can be written with a valid created_by profile id.',
      );
    }

    if (this.actorProfileIdPromise) {
      return this.actorProfileIdPromise;
    }

    this.actorProfileIdPromise = (async () => {
      const { data, error } = await this.supabaseAdminService.client
        .from('profiles')
        .select('id')
        .eq('id', configuredProfileId)
        .maybeSingle();

      if (error) {
        throw new BadRequestException(error.message);
      }

      if (!data?.id) {
        throw new BadRequestException(
          `CLASSROOM_SYNC_ACTOR_PROFILE_ID does not exist in public.profiles: ${configuredProfileId}`,
        );
      }

      return data.id as string;
    })();

    return this.actorProfileIdPromise;
  }

  private resolveTeacherName(
    post: ClassroomPost,
    teacherNameMap: Map<string, string>,
  ) {
    const userId = post.creatorUserId ?? post.ownerId;
    if (!userId) {
      return null;
    }

    return teacherNameMap.get(userId) ?? null;
  }

  private extractContent(post: ClassroomPost) {
    const content =
      post.text?.trim() || post.description?.trim() || this.stringifyMaterials(post.materials);

    return content || null;
  }

  private stringifyMaterials(materials?: unknown[]) {
    if (!Array.isArray(materials) || materials.length === 0) {
      return '';
    }

    return materials
      .map((material) => {
        if (!material || typeof material !== 'object') {
          return '';
        }

        const record = material as Record<string, any>;
        const title =
          typeof record.title === 'string'
            ? record.title
            : typeof record.form?.title === 'string'
              ? record.form.title
              : typeof record.link?.title === 'string'
                ? record.link.title
                : '';
        const url =
          typeof record.link?.url === 'string'
            ? record.link.url
            : typeof record.driveFile?.driveFile?.alternateLink === 'string'
              ? record.driveFile.driveFile.alternateLink
              : '';

        return [title, url].filter(Boolean).join(' ');
      })
      .filter(Boolean)
      .join('\n');
  }

  private buildDueAt(post: ClassroomPost) {
    if (!post.dueDate) {
      return null;
    }

    const year = post.dueDate.year ?? new Date().getFullYear();
    const month = (post.dueDate.month ?? 1) - 1;
    const day = post.dueDate.day ?? 1;
    const hours = post.dueTime?.hours ?? 0;
    const minutes = post.dueTime?.minutes ?? 0;
    const seconds = post.dueTime?.seconds ?? 0;

    return new Date(
      Date.UTC(year, month, day, hours, minutes, seconds),
    ).toISOString();
  }

  private normalizePostType(sourceType?: ClassroomPost['sourceType']) {
    if (sourceType === 'announcement') {
      return 'announcement';
    }

    if (sourceType === 'coursework') {
      return 'coursework';
    }

    if (sourceType === 'material') {
      return 'material';
    }

    return 'announcement';
  }

  private normalizeTitle(title?: string) {
    return title?.trim() || '제목 없음';
  }

  private normalizeOptionalText(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeNumber(value?: number | null) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private normalizeLine(value: string) {
    return value.replace(/\u00a0/g, ' ').trim();
  }

  private stripLeadingNumbering(line: string) {
    return line.replace(/^\s*(?:\d+[\.\)]\s*|[-*•]\s*)+/, '').trim();
  }

  private matchLabelLine(line: string, labels: string[]) {
    for (const label of labels) {
      const pattern = new RegExp(
        `^${this.escapeRegex(label)}\\s*[:：\\-]?\\s*(.*)$`,
      );
      const match = line.match(pattern);
      if (match) {
        return {
          label,
          value: this.normalizeOptionalText(match[1]) ?? '',
        };
      }
    }

    return null;
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private parsePositiveInteger(value?: string | null) {
    if (!value) {
      return null;
    }

    const match = value.replace(/[,]/g, '').match(/\d+/);
    if (!match) {
      return null;
    }

    const parsed = Number.parseInt(match[0], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private parseBooleanish(value?: string | null) {
    const text = (value ?? '').toLowerCase();
    if (!text) {
      return false;
    }

    return /예|가능|true|yes|y|o|있음|해당|지원/.test(text);
  }

  private parseDeadline(value?: string | null) {
    if (!value) {
      return null;
    }

    const normalized = value
      .trim()
      .replace(/\./g, '-')
      .replace(/년/g, '-')
      .replace(/월/g, '-')
      .replace(/일/g, '')
      .replace(/\//g, '-')
      .replace(/\s+/g, ' ');

    const directDate = new Date(normalized);
    if (!Number.isNaN(directDate.getTime())) {
      return directDate.toISOString();
    }

    const match = normalized.match(
      /(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/,
    );

    if (!match) {
      return null;
    }

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10) - 1;
    const day = Number.parseInt(match[3], 10);
    const hours = match[4] ? Number.parseInt(match[4], 10) : 0;
    const minutes = match[5] ? Number.parseInt(match[5], 10) : 0;

    const parsed = new Date(Date.UTC(year, month, day, hours, minutes));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private extractCompanyName(title?: string | null, content?: string | null) {
    const text = `${title ?? ''}\n${content ?? ''}`;
    const match = text.match(/(?:기업명|회사명)\s*[:：\-]?\s*(.+)/);
    if (match?.[1]) {
      return match[1].trim();
    }

    const companyLikeLine = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => /회사|기업|주식회사|㈜|\(주\)/.test(line));

    return companyLikeLine ?? null;
  }

  private extractLocationFromContent(content?: string | null) {
    if (!content) {
      return null;
    }

    const match = content.match(/(?:근무지|주소)\s*[:：\-]?\s*(.+)/);
    return match?.[1]?.trim() ?? null;
  }

  private isSameSourceVersion(existingRaw: RawPostRow, sourceUpdatedAt: string | null) {
    const existingUpdateTime =
      this.readRawJsonString(existingRaw.raw_json, 'updateTime') ??
      this.readRawJsonString(existingRaw.raw_json, 'creationTime');

    if (!sourceUpdatedAt || !existingUpdateTime) {
      return false;
    }

    return existingUpdateTime === sourceUpdatedAt;
  }

  private isFinalParseStatus(status: string) {
    return status === 'parsed_notice' || status === 'parsed_recruitment';
  }

  private readRawJsonString(rawJson: unknown, key: string) {
    if (!rawJson || typeof rawJson !== 'object') {
      return null;
    }

    const value = (rawJson as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
  }

  private ensureWriteCredentials() {
    const serviceRoleKey =
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ??
      this.configService.get<string>('SUPABASE_SERVICE_ROLE');

    if (!serviceRoleKey) {
      throw new BadRequestException(
        'SUPABASE_SERVICE_ROLE_KEY is required for classroom sync writes.',
      );
    }
  }
}
