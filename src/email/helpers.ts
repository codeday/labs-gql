/* eslint-disable @typescript-eslint/no-explicit-any */
import handlebars from 'handlebars';
import { Mentor, Student, Project, Event } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import config from '../config';
import { JwtToken, AuthRole, AuthByTarget } from '../context';
import { DateTime } from 'luxon';
import { diffChars, diffWords } from 'diff';

function isMentor(sub: any): sub is Mentor {
  return Boolean(sub.maxWeeks);
}

export function tokenFor(sub: Mentor | Student) {
  const payload: Partial<JwtToken> = { tgt: AuthByTarget.ID, sid: sub.id, evt: sub.eventId || (sub as unknown as any).event?.id };
  if (isMentor(sub)) payload.typ = AuthRole.MENTOR;
  else payload.typ = AuthRole.STUDENT;

  return sign(payload, config.auth.secret, { audience: config.auth.audience, expiresIn: '24w', noTimestamp: true });
}

export function dashboardFor(sub: Mentor | Student) {
  if (isMentor(sub)) return `https://labs.codeday.org/dash/m/${tokenFor(sub)}`;
  else return `https://labs.codeday.org/dash/s/${tokenFor(sub)}`;
}

function fallback(value: any, safeValue: any) {
  const out = value || safeValue;
  return new handlebars.SafeString(out);
}

function when(this: any, operandA: any, operator: string, operandB: any, options: any) {
  const operators = {
    eq: (l: any, r: any) => l === r,
    neq: (l: any, r: any) => l !== r,
    gt: (l: any, r: any) => Number(l) > Number(r),
    or: (l: any, r: any) => l || r,
    and: (l: any, r: any) => l && r,
    '%': (l: any, r: any) => (l % r) === 0,
  };
  if (!(operator in operators)) throw Error(`${operator} is not a valid operator.`);
  if (operators[<keyof typeof operators>operator](operandA, operandB)) return options.fn(this);
  return options.inverse(this);
}

function add(value: number, toAdd: number): number {
  return value + toAdd;
}

function prettyCamel(value: string): string {
  return value
    .split(/([A-Z][^A-Z]+)/)
    .filter(Boolean)
    .join('_')
    .split(/_/)
    .filter(Boolean)
    .map((e) => e[0].toUpperCase() + e.slice(1))
    .join(' ');
}

function prettyObj(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return <string>value;
  if (Array.isArray(value)) return value.map((v) => prettyObj(v)).join(', ');
  return JSON.stringify(value);
}

// eslint-disable-next-line @typescript-eslint/ban-types
function mapToKey(value: object[], key: string): string[] {
  return value.map((e) => e[<keyof typeof e>key]);
}

function names(value: Mentor[] | Student[]): string[] {
  return value.map((e: Mentor | Student) => `${e.givenName} ${e.surname}`);
}

function join(value: string[], joiner: string): string {
  return value.join(joiner);
}

function plural(value: any[], ifPlural: string, ifNotPlural: string): string {
  if (value.length === 1) return ifNotPlural;
  return ifPlural;
}

function mentorManagers(project: Project & { mentors: Mentor[] }, suffix?: string): string[] {
  return [...new Set(project.mentors.map((m) => m.managerUsername))].map((m) => `${m}${suffix || ''}`);
}

function lowercase(value: string): string {
  return value.toLocaleLowerCase();
}

function nextWeek(value: Date): Date {
  return DateTime.fromJSDate(value).plus({ weeks: 1 }).toJSDate();
}

function endDate(event: Event, obj: Student | (Mentor & { students?: Student[] })): Date {
  if ('weeks' in obj) return DateTime.fromJSDate(event.startsAt).plus({ weeks: obj.weeks || event.defaultWeeks || 4 }).toJSDate();
  return DateTime
    .fromJSDate(event.startsAt)
    .plus({ weeks: (obj.students ? Math.max(0, ...obj.students.map(s => s.weeks)) : obj.maxWeeks) || event.defaultWeeks || 4 })
    .toJSDate();
}

function prettyDate(value: Date): string {
  return DateTime.fromJSDate(value).toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY);
}

function shortDate(value: Date): string {
  return DateTime.fromJSDate(value).toLocaleString({ month: 'short', day: 'numeric' });
}

function diff(oldStr: string, newStr: string): string {
  const diff = diffWords(oldStr, newStr)
  if (diff.length > 15) return `<div style="color: red">${oldStr}</div><br /><div style="color: green">${newStr}</div>`;
  else return diff.map(part => {
    const color = part.added
      ? 'green'
      : part.removed && 'red';
    return color
      ? `<span style="color: ${color}">${part.value}</span>`
      : part.value;
  }).join('');
}

export function registerHandlebarsHelpers(): void {
  handlebars.registerHelper('diff', diff);
  handlebars.registerHelper('tokenFor', tokenFor);
  handlebars.registerHelper('dashboardFor', dashboardFor);
  handlebars.registerHelper('fallback', fallback);
  handlebars.registerHelper('when', when);
  handlebars.registerHelper('add', add);
  handlebars.registerHelper('prettyCamel', prettyCamel);
  handlebars.registerHelper('prettyObj', prettyObj);
  handlebars.registerHelper('mapToKey', mapToKey);
  handlebars.registerHelper('names', names);
  handlebars.registerHelper('join', join);
  handlebars.registerHelper('plural', plural);
  handlebars.registerHelper('mentorManagers', mentorManagers);
  handlebars.registerHelper('lowercase', lowercase);
  handlebars.registerHelper('endDate', endDate);
  handlebars.registerHelper('nextWeek', nextWeek);
  handlebars.registerHelper('prettyDate', prettyDate);
  handlebars.registerHelper('shortDate', shortDate);
}
