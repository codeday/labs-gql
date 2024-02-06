declare module '@codeday/uploader-node' {

  interface FileReturn {
    id: string;
    url: string;
  }

  interface ImageReturn {
    id: string;
    url: string;
    urlResize: string;
  }

  interface VideoReturn {
    id: string;
    sourceId: string;
    url: string;
    stream: string;
    image: string;
    animatedImage: string;
  }

  export default class Uploader {
    constructor(url: string, token?: string);

    file(file: Buffer | string, filename: string): FileReturn;

    image(file: Buffer | string, filename: string): ImageReturn;

    video(file: Buffer | string, filename: string): VideoReturn;
  }
}