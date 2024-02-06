import { FileUpload } from 'graphql-upload';

export async function uploadToBuffer(upload: FileUpload): Promise<Buffer> {
  const chunks = [];
  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of (await upload).createReadStream()) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}