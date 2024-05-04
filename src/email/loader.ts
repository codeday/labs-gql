import fs from 'fs';
import path from 'path';
import { Event, PrismaClient } from '@prisma/client';
import frontMatter from 'front-matter';
import handlebars from 'handlebars';
import { Marked } from '@ts-stack/markdown';
import { maybeRequire } from '../utils';
import { EmailContext, FrontMatter } from './spec';
import { makeDebug } from '../utils';

const DEBUG = makeDebug('email:loader');

const EMAIL_DIR = path.join(__dirname, 'templates');

export type PartialEvent = Pick<Event, 'id' | 'name' | 'emailSignature' | 'title' | 'startsAt' | 'defaultWeeks'>;

interface EmailGeneratorTs {
  getId(): Promise<string | null>
  getList(client: PrismaClient, event: PartialEvent): Promise<EmailContext[] | null>
  ALLOW_INACTIVE?: boolean;
}

export interface EmailGenerator extends EmailGeneratorTs {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template(context: Record<string, any>): Promise<{ frontMatter: FrontMatter, text: string, html: string }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isEmailTs(obj: Record<string, any> | undefined): obj is EmailGeneratorTs {
  return typeof obj?.getId === 'function' && typeof obj?.getList === 'function';
}

export async function getEmailGenerators(): Promise<EmailGenerator[]> {
  const files = await Promise.all(fs.readdirSync(EMAIL_DIR)
    .filter((n) => n !== 'spec.ts' && path.extname(n) === '.md')
    .map((fileName) => fileName.replace(/\.[^/.]+$/, ''))
    .map((fileBaseName) => ({
      ts: `${path.join(EMAIL_DIR, fileBaseName)}.ts`,
      js: `${path.join(EMAIL_DIR, fileBaseName)}.js`,
      md: `${path.join(EMAIL_DIR, fileBaseName)}.md`,
    }))
    .map(async (paths): Promise<EmailGenerator | undefined> => {
      const jsExists = fs.existsSync(paths.js);
      const tsExists = fs.existsSync(paths.ts);
      if (!jsExists && !tsExists) return undefined;
      const ts = maybeRequire(tsExists ? paths.ts : paths.js);
      if (!isEmailTs(ts)) return undefined;

      const md = await fs.promises.readFile(paths.md);
      const tpl = await handlebars.compile(md.toString());

      return {
        ...ts,
        async template(context) {
          const renderedMd = tpl(context);
          const { attributes: renderedFm, body: renderedBody } = frontMatter<FrontMatter>(renderedMd);

          return {
            frontMatter: renderedFm,
            text: renderedBody,
            html: Marked.parse(renderedBody),
          };
        },
      };
    }));

  const validFiles = files.filter(Boolean);

  DEBUG(`Loaded ${validFiles.length} email generators.`);

  return <EmailGenerator[]> validFiles;
}
