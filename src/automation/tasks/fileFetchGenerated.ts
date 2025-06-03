import { PrismaClient, File, Prisma, FileTypeType } from "@prisma/client";
import Container from "typedi";
import { makeDebug } from "../../utils";
import { fileTypeToExt, getFinalUrl } from "../../placid";
import Uploader from "@codeday/uploader-node";
import { DateTime } from "luxon";

const DEBUG = makeDebug('automation:tasks:emailDueSurveysReminder');

export const JOBSPEC = '5,15,25,35,45,55 * * * *';


export default async function fileFetchGenerated() {
  const prisma = Container.get(PrismaClient);

  const files = await prisma.file.findMany({
    where: {
      url: null,
      pollingUrl: { not: null },
      fileType: { event: { isActive: true } },
      createdAt: { gt: DateTime.now().minus({ days: 1 }).toJSDate() }
    },
    include: { fileType: true }
  });

  for (const file of files) {
    try {
      DEBUG(`Checking generation status for ${file.id}`);
      const finalUrl = await getFinalUrl(file.pollingUrl!);
      if (!finalUrl) continue;

      // Mirror the file to our CDN
      const dl = await (await fetch(finalUrl)).arrayBuffer();
      if (!dl) throw new Error('Could not fetch file.');
      const { url } = await (<Uploader>Container.get(Uploader))
          .file(Buffer.from(dl), `file.${fileTypeToExt(file.fileType.type)}`);

      DEBUG(`${file.id} finalized, uploading content...`);
      await prisma.file.update({
        where: { id: file.id },
        data: {
          url,
          pollingUrl: null,
        },
      });
    } catch (ex) {
      DEBUG(`Error generating ${file.id} (${file.fileTypeId})`);
      await prisma.file.delete({ where: { id: file.id }});
    }
  }
}