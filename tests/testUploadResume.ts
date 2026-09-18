import test from 'node:test';
import assert from 'node:assert/strict';
import { Container } from 'typedi';
import Uploader from '@codeday/uploader-node';
import { uploadResume } from '../src/utils/uploadResume';
import { FileUpload } from 'graphql-upload';

let uploadedFilename: string | undefined;

function makeFile(filename: string): FileUpload {
  return {
    filename,
    createReadStream: () =>
      (async function* generateChunks() {
        yield Buffer.from('resume-bytes');
      })(),
  } as unknown as FileUpload;
}

Container.set(Uploader, {
  async file(_file: Buffer, filename: string) {
    uploadedFilename = filename;
    return { id: 'test-id', url: 'https://cdn.example.com/uploaded' };
  },
} as unknown as typeof Uploader);

test('accepts an uppercase extension and forwards a lowercased filename to the uploader', async () => {
  uploadedFilename = undefined;
  const url = await uploadResume(makeFile('Resume.PDF') as any);
  assert.equal(url, 'https://cdn.example.com/uploaded');
  assert.equal(uploadedFilename, '_.pdf');
});

test('still accepts a lowercase extension (no regression on the happy path)', async () => {
  uploadedFilename = undefined;
  await uploadResume(makeFile('resume.pdf') as any);
  assert.equal(uploadedFilename, '_.pdf');
});

test('still rejects an unsupported extension even when it is uppercase', async () => {
  uploadedFilename = undefined;
  await assert.rejects(
    () => uploadResume(makeFile('photo.JPG') as any),
    /Only PDF and DOC\/DOCX files are supported\./,
  );
  assert.equal(uploadedFilename, undefined, 'uploader must not be called for rejected files');
});
