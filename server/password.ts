/**
 * Hash de senha com PBKDF2 sobre a Web Crypto, que existe nativamente no
 * runtime dos Workers. bcrypt e Argon2 exigiriam WASM sem ganho prático aqui.
 */

const ITERATIONS = 210_000;
const KEY_LENGTH = 256;
const SALT_BYTES = 16;

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    KEY_LENGTH,
  );
  return new Uint8Array(bits);
}

/** Formato guardado no banco: `pbkdf2$<iterações>$<salt>$<hash>`. */
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

/** Comparação em tempo constante: o tempo de resposta não revela o acerto. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !hash) return false;

  try {
    const derived = await derive(password, fromBase64(salt), Number(iterations));
    return timingSafeEqual(derived, fromBase64(hash));
  } catch {
    return false;
  }
}

/** Hash simples para tokens de sessão e códigos, que já são aleatórios. */
export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toBase64(new Uint8Array(digest));
}

export function randomToken(bytes = 32) {
  return toBase64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function randomId(prefix: string) {
  return `${prefix}_${randomToken(9)}`;
}

/** Senha provisória legível, para o dono ditar ao barbeiro. */
export function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(values, value => alphabet[value % alphabet.length]).join("");
}
