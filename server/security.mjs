import { randomBytes, scrypt as rawScrypt, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(rawScrypt);
export const token = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
export async function checkPassword(password, encoded) {
  const [algorithm, salt, expected] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const actual = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const bytes = Buffer.from(expected, 'hex');
  return bytes.length === actual.length && timingSafeEqual(bytes, actual);
}
const signupCookieName = 'edutrack_signup';
function signupProof(user) {
  return createHmac('sha256', user.password_hash).update('edutrack:verify-signup:' + user.id).digest();
}
export function signupCookie(user, origin) {
  return `${signupCookieName}=${user ? signupProof(user).toString('hex') : token()}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=86400${origin.startsWith('https:') ? '; Secure' : ''}`;
}
export function matchesSignupCookie(header = '', user) {
  const proof = header.split(';').map(part => part.trim()).find(part => part.startsWith(signupCookieName + '='))?.slice(signupCookieName.length + 1);
  if (!proof || !/^[a-f0-9]{64}$/.test(proof)) return false;
  return timingSafeEqual(Buffer.from(proof, 'hex'), signupProof(user));
}
export function sessionCookie(value, origin, clear = false) {
  return `edutrack_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : 604800}${origin.startsWith('https:') ? '; Secure' : ''}`;
}
export function readSessionCookie(header = '') {
  return header.split(';').map(s => s.trim()).find(s => s.startsWith('edutrack_session='))?.slice(17) || '';
}
