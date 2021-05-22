import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import frontMatter from 'front-matter';
import handlebars from 'handlebars';
import { Marked } from '@ts-stack/markdown';
import { maybeRequire } from '../utils';
import { EmailContext, FrontMatter } from './spec';

const EMAIL_DIR = path.join(__dirname, 'templates');

interface EmailGeneratorTs {
  getId(): Promise<string | null>
  getList(client: PrismaClient): Promise<EmailContext[] | null>
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
    .filter((n) => n !== 'spec.ts' && path.extname(n) !== '.ts')
    .map((fileName) => fileName.replace(/\.[^/.]+$/, ''))
    .map((fileBaseName) => ({
      ts: `${path.join(EMAIL_DIR, fileBaseName)}.ts`,
      md: `${path.join(EMAIL_DIR, fileBaseName)}.md`,
    }))
    .filter((paths) => fs.existsSync(paths.md))
    .map(async (paths): Promise<EmailGenerator | undefined> => {
      const ts = maybeRequire(paths.ts);
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

  return <EmailGenerator[]> files.filter(Boolean);
}
