import { Stream } from 'stream';

export async function streamToBuffer(stream: Stream): Promise<Buffer> {
  return new Promise < Buffer >((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buf: any[] = [];

    stream.on('data', (chunk) => buf.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(buf)));
    stream.on('error', (err) => reject(err));
  });
}