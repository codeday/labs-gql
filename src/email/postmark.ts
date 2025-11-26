import { Request, Response } from 'express';
import { makeDebug } from '../utils';
import config from '../config';
import Container from 'typedi';
import { PrismaClient } from '@prisma/client';
import { Transporter } from 'nodemailer';

const DEBUG = makeDebug('email:postmark');

interface PostmarkInboundEmailFull {
  Email: string
  Name: string
  MailboxHash: string
}

interface PostmarkRequest {
  FromName: string
  MessageStream: string
  From: string
  FromFull: PostmarkInboundEmailFull,
  To: string
  ToFull: PostmarkInboundEmailFull[]
  Cc: string
  CcFull: PostmarkInboundEmailFull[]
  Bcc: string
  BccFull: PostmarkInboundEmailFull[]
  OriginalRecipient: string
  Subject: string
  MessageId: string
  ReplyTo: string
  MailboxHash: string
  Date: string
  TextBody: string
  HtmlBody: string
  StrippedTextReply: string
  Tag: String
  Headers: { Name: string, Value: string }[]
  Attachments: { Name: string, Content: string, ContentType: string, ContentLength: number }[]
}

export async function processPostmarkInboundEmail(req: Request, res: Response) {
  const prisma = Container.get(PrismaClient);
  const postmark = await Container.get<Transporter>('email');
  const email = req.body as PostmarkRequest;
  DEBUG(`New project email from ${email.From}`);

  const allToEmails = Array.from(
    new Set([...email.ToFull, ...email.CcFull, ...email.BccFull].map(s => s.Email.toLowerCase()))
  );

  const myToEmails = allToEmails
    .filter(e => e.split('@')[1] === config.email.inboundDomain)

  const otherToEmails = allToEmails
    .filter(e => e.split('@')[1] !== config.email.inboundDomain);

  if (myToEmails.length === 0) {
    DEBUG(`...not associated with a project.`);
    return res.send('ok');
  }

  DEBUG(`...project email addresses:`, myToEmails.join(','));
  const projectId = myToEmails[0].split('@')[0].split('+')[0];
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      id: true,
      mentors: { select: { id: true, email: true } },
      students: { select: { id: true, email: true } },
      event: { select: { emailSignature: true, name: true } },
    },
  });

  if (otherToEmails.length === 0) {
    DEBUG(`...email was only sent to us`);
    await postmark.sendMail({
      from: myToEmails[0] ? `"${project?.event?.name || 'CodeDay'}" <${myToEmails[0]}>` : config.email.from,
      to: email.FromFull.Email,
      subject: `Re: ${email.Subject}`,
      html: `<p>No one received your message. It was only sent to this unmonitored mailbox. <strong>You likely forgot to reply-all.</strong></p>\n${project?.event?.emailSignature}\n<br /><br /><blockquote>${email.HtmlBody}</blockquote>`
    });
    return res.send('ok');
  }

  if (!project) {
    DEBUG(`...project ${projectId} not found.`);
    return res.send('ok');
  }

  const emailSentId = myToEmails[0].split('+')[1] || undefined;
  const emailSent = !emailSentId ? undefined : await prisma.emailSent.findUniqueOrThrow({
    where: { id: emailSentId },
    select: { id: true },
  });

  const fromMentor = project.mentors.filter(m => m.email.toLowerCase().trim() === email.FromFull.Email.toLowerCase().trim())[0] || undefined;
  const fromStudent = project.students.filter(s => s.email.toLowerCase().trim() === email.FromFull.Email.toLowerCase().trim())[0] || undefined;

  DEBUG(`... email ${email.FromFull.Email} matches: mentor - ${fromMentor?.id}, student - ${fromStudent?.id}`);

  await prisma.projectEmail.create({
    data: {
      project: { connect: { id: project.id } },
      ...(fromMentor ? { mentor: { connect: { id: fromMentor.id } } } : {}),
      ...(fromStudent ? { student: { connect: { id: fromStudent.id } } } : {}),
      ...(emailSent ? { emailSent: { connect: { id: emailSent.id } } } : {}),
      subject: email.Subject,
      textBody: email.TextBody,
      htmlBody: email.HtmlBody,
      to: email.To,
      cc: email.Cc,
    },
  });
  DEBUG(`...project email tracked.`);

  res.send('ok');
}