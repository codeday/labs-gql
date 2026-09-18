import { FileTypeType } from "@prisma/client";
import handlebars from 'handlebars';
import config from '../config';
import { makeDebug } from '../utils';

const DEBUG = makeDebug('placid');

function fileTypeTypeToUrl(type: FileTypeType): string {
  switch (type) {
    case FileTypeType.IMAGE:
      return 'https://api.placid.app/api/rest/images';
    case FileTypeType.PDF:
      return 'https://api.placid.app/api/rest/pdfs';
    case FileTypeType.VIDEO:
      return 'https://api.placid.app/api/rest/videos';
  }
}

export function fileTypeToExt(fileType: FileTypeType): string {
  switch(fileType) {
      case FileTypeType.IMAGE:
          return 'jpg';
      case FileTypeType.PDF:
          return 'pdf';
      case FileTypeType.VIDEO:
          return 'mp4';
  }
}

export function renderLayers(layers: unknown, context: object): unknown {
  const renderCtx = { now: new Date(), ...context };
  const render = (s: string): string => handlebars.compile(s, { noEscape: true })(renderCtx);
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map((v) => walk(v));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    }
    if (typeof value === 'string') return render(value);
    return value;
  };
  return walk(layers);
}

export async function generateMedia(
  templateId: string,
  type: FileTypeType,
  layers: object,
  context: object,
): Promise<string> {
  const finalLayers = renderLayers(layers, context);

  let body: object = { template_uuid: templateId, layers: finalLayers };
  if (type === FileTypeType.VIDEO) body = { clips: [body] };
  else if (type === FileTypeType.PDF) body = { pages: [body]};

  const result = await fetch(
    fileTypeTypeToUrl(type),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.placid.apiToken}`
      },
      body: JSON.stringify(body),
    }
  ).then(r => r.json());

  DEBUG(`Requested ${type} generation for template ${templateId}.`);
  if (result.polling_url) return result.polling_url;
  if (result.id) return `${fileTypeTypeToUrl(type)}/${result.id}`;
  DEBUG(JSON.stringify(finalLayers));
  DEBUG(result);
  throw new Error('API did not return polling URL.');
}

export async function getFinalUrl(pollingUrl: string): Promise<string | null> {
  const result = await fetch(
    pollingUrl,
    {
      headers: {
        'Authorization': `Bearer ${config.placid.apiToken}`
      },
    }
  ).then(r => r.json());
  if (result.status === 'error') throw new Error('Error generating a file');
  if (result.status === 'queued') return null;
  return result.image_url || result.pdf_url || result.video_url;
}