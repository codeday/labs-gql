import { Event, Mentor, Partner, Student } from "@prisma/client";
import config from "../config";
import { AuthByTarget, AuthRole, JwtToken } from "../context";
import { sign } from "jsonwebtoken";

function isMentor(sub: any): sub is Mentor {
  return Boolean(sub.maxWeeks);
}

export function signTokenUser(sub: Mentor | Student) {
  const payload: Partial<JwtToken> = { tgt: AuthByTarget.ID, sid: sub.id, evt: sub.eventId };
  if (isMentor(sub)) payload.typ = AuthRole.MENTOR;
  else payload.typ = AuthRole.STUDENT;

  return sign(payload, config.auth.secret, { audience: config.auth.audience, expiresIn: '24w', noTimestamp: true });
}

export function signTokenPartner(partner: Partner) {
  const payload: Partial<JwtToken> = { typ: AuthRole.PARTNER, pc: partner.partnerCode, evt: partner.eventId };
  return sign(payload, config.auth.secret, { audience: config.auth.audience, expiresIn: '24w', noTimestamp: true });
}

export function signTokenAdmin(event: Event) {
  const payload: Partial<JwtToken> = { typ: AuthRole.ADMIN, evt: event.id };
  return sign(payload, config.auth.secret, { audience: config.auth.audience, expiresIn: '24w', noTimestamp: true });
}

export function signTokenManager(event: Event) {
  const payload: Partial<JwtToken> = { typ: AuthRole.MANAGER, evt: event.id };
  return sign(payload, config.auth.secret, { audience: config.auth.audience, expiresIn: '24w', noTimestamp: true });
}
