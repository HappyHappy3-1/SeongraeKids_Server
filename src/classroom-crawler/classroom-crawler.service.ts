import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import puppeteer, { type Browser, type Cookie, type Page } from 'puppeteer';
import { SupabaseService } from '../supabase/supabase.service';

const COOKIE_STORE = path.resolve(process.cwd(), '.classroom-cookies.json');

export interface CrawlResult {
  courseId: string;
  fetched: number;
  upserted: number;
  sample: Array<{ title: string; link: string; createdAt?: string }>;
}

@Injectable()
export class ClassroomCrawlerService {
  private readonly logger = new Logger(ClassroomCrawlerService.name);
  private readonly email: string | null;
  private readonly password: string | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.email = this.configService.get<string>('GOOGLE_EMAIL') ?? null;
    this.password = this.configService.get<string>('GOOGLE_PASSWORD') ?? null;
  }

  private async loadCookies(): Promise<Cookie[] | null> {
    try {
      const raw = await fs.readFile(COOKIE_STORE, 'utf8');
      return JSON.parse(raw) as Cookie[];
    } catch {
      return null;
    }
  }

  private async saveCookies(cookies: Cookie[]) {
    await fs.writeFile(COOKIE_STORE, JSON.stringify(cookies, null, 2), 'utf8');
  }

  private async openBrowser(
    headless: boolean,
    force?: 'headless' | 'headful',
  ): Promise<Browser> {
    let resolved = headless;
    if (force === 'headful') resolved = false;
    else if (force === 'headless') resolved = true;
    else if (
      this.configService.get<string>('CLASSROOM_CRAWLER_HEADLESS') !== 'false'
    ) {
      resolved = true;
    }
    return puppeteer.launch({
      headless: resolved,
      defaultViewport: { width: 1280, height: 900 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }

  private async applyStoredCookies(page: Page): Promise<boolean> {
    const stored = await this.loadCookies();
    if (!stored || stored.length === 0) return false;
    await page.setCookie(...stored);
    return true;
  }

  /** Interactive login in headful browser. Saves cookies. */
  async captureCookies(): Promise<{ saved: number }> {
    const browser = await this.openBrowser(false, 'headful');
    try {
      const page = await browser.newPage();
      await page.goto('https://classroom.google.com/', {
        waitUntil: 'domcontentloaded',
      });
      this.logger.log('Headful browser opened. Please sign in manually...');
      await page.waitForFunction(
        () => location.hostname === 'classroom.google.com' && !location.href.includes('/?'),
        { timeout: 180_000 },
      );
      const cookies = await browser.cookies();
      await this.saveCookies(cookies);
      this.logger.log(`Saved ${cookies.length} cookies to ${COOKIE_STORE}`);
      return { saved: cookies.length };
    } finally {
      await browser.close();
    }
  }

  /** Attempt automated login with email/password. Best-effort — Google may block. */
  async automatedLogin(): Promise<{ saved: number }> {
    if (!this.email || !this.password) {
      throw new Error('GOOGLE_EMAIL / GOOGLE_PASSWORD env not set');
    }
    const browser = await this.openBrowser(false);
    try {
      const page = await browser.newPage();
      await page.goto(
        'https://accounts.google.com/ServiceLogin?service=classroom',
        { waitUntil: 'domcontentloaded' },
      );
      await page.waitForSelector('input[type=email]', { timeout: 20_000 });
      await page.type('input[type=email]', this.email, { delay: 40 });
      await page.click('#identifierNext');
      await page.waitForSelector('input[type=password]', {
        timeout: 20_000,
        visible: true,
      });
      await page.waitForFunction(
        () => {
          const el = document.querySelector(
            'input[type=password]',
          ) as HTMLInputElement | null;
          return el && !el.disabled && el.offsetParent !== null;
        },
        { timeout: 20_000 },
      );
      await page.type('input[type=password]', this.password, { delay: 40 });
      await page.click('#passwordNext');
      await page.waitForFunction(
        () => location.hostname === 'classroom.google.com',
        { timeout: 60_000 },
      );
      const cookies = await browser.cookies();
      await this.saveCookies(cookies);
      return { saved: cookies.length };
    } finally {
      await browser.close();
    }
  }

  async debugDump(courseId: string): Promise<{
    url: string;
    title: string;
    htmlHead: string;
    bodySample: string;
    anchors: Array<{ href: string; text: string }>;
  }> {
    const browser = await this.openBrowser(true);
    try {
      const page = await browser.newPage();
      const applied = await this.applyStoredCookies(page);
      if (!applied) throw new Error('No cookies.');
      const urls = [
        `https://classroom.google.com/u/0/c/${courseId}/t/all`,
        `https://classroom.google.com/u/1/c/${courseId}/t/all`,
        `https://classroom.google.com/u/0/c/${courseId}`,
        `https://classroom.google.com/u/1/c/${courseId}`,
      ];
      let nav = '';
      for (const u of urls) {
        await page.goto(u, { waitUntil: 'networkidle2', timeout: 45_000 });
        await new Promise((r) => setTimeout(r, 3000));
        if (!page.url().includes('accounts.google.com')) {
          nav = page.url();
          break;
        }
      }
      if (!nav) throw new Error('redirected to login');
      const title = await page.title();
      const htmlHead = await page.evaluate(() =>
        document.head.innerHTML.slice(0, 500),
      );
      const bodySample = await page.evaluate(() => {
        const main = document.querySelector('main') ?? document.body;
        return (main?.innerHTML ?? '').slice(0, 4000);
      });
      const anchors = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a'))
          .slice(0, 40)
          .map((a) => ({
            href: a.getAttribute('href') || '',
            text: (a.textContent || '').trim().slice(0, 80),
          })),
      );
      return { url: nav, title, htmlHead, bodySample, anchors };
    } finally {
      await browser.close();
    }
  }

  async crawlCourse(courseId: string): Promise<CrawlResult> {
    const browser = await this.openBrowser(true);
    try {
      const page = await browser.newPage();
      const applied = await this.applyStoredCookies(page);
      if (!applied) {
        throw new Error(
          'No cookies cached. Run /classroom-crawler/login first to capture a session.',
        );
      }
      const urls = [
        `https://classroom.google.com/u/0/c/${courseId}/t/all`,
        `https://classroom.google.com/u/1/c/${courseId}/t/all`,
        `https://classroom.google.com/u/0/c/${courseId}`,
        `https://classroom.google.com/u/1/c/${courseId}`,
      ];
      let navigated = '';
      for (const u of urls) {
        await page.goto(u, { waitUntil: 'networkidle2', timeout: 45_000 });
        await new Promise((r) => setTimeout(r, 2000));
        const cur = page.url();
        if (!cur.includes('accounts.google.com')) {
          navigated = cur;
          break;
        }
      }
      if (!navigated) {
        throw new Error(
          'Session cookies expired. Re-run /classroom-crawler/login.',
        );
      }

      await page.waitForFunction(
        () =>
          document.querySelectorAll('a[href*="/a/"]').length > 0 ||
          document.querySelectorAll('[role="listitem"]').length > 2 ||
          document.querySelectorAll('h3').length > 0,
        { timeout: 15_000 },
      ).catch(() => undefined);

      this.logger.log(`Crawled ${navigated}`);

      const posts = await page.evaluate(() => {
        const out: Array<{ title: string; link: string; createdAt?: string }> = [];
        const anchors = Array.from(
          document.querySelectorAll<HTMLAnchorElement>('a[href*="/a/"]'),
        );
        anchors.forEach((a) => {
          const title =
            a.textContent?.trim() ||
            a.getAttribute('aria-label')?.trim() ||
            a.querySelector('h3, h4, [role="heading"], span')?.textContent?.trim() ||
            '';
          const link = a.href;
          if (title && title.length > 1 && link.includes('/a/')) {
            out.push({ title, link });
          }
        });
        return out;
      });

      const unique = posts.filter(
        (p, i, arr) => arr.findIndex((q) => q.title === p.title) === i,
      );

      const actor = this.configService.get<string>(
        'CLASSROOM_SYNC_ACTOR_PROFILE_ID',
      );
      let upserted = 0;
      if (actor && this.supabaseService.hasServiceRoleKey && unique.length > 0) {
        const admin = this.supabaseService.createAdminClient();
        for (const p of unique) {
          if (!/(채용|공고|공채|수시|모집|인턴)/.test(p.title)) continue;
          const { error } = await admin.from('recruitment_posts').upsert(
            {
              company_name: p.title.slice(0, 120),
              headcount: 1,
              location: '미정',
              classroom_link: p.link || null,
              military_service_available: false,
              created_by: actor,
            },
            { onConflict: 'classroom_link' },
          );
          if (!error) upserted += 1;
        }
      }

      return {
        courseId,
        fetched: unique.length,
        upserted,
        sample: unique.slice(0, 10),
      };
    } finally {
      await browser.close();
    }
  }
}
