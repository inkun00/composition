const encoder = new TextEncoder();
const ITERATIONS = 100_000;

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array {
  if (!/^[0-9a-f]{32}$/.test(value)) throw new Error("invalid-album-salt");
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (part) => Number.parseInt(part, 16));
}

export function newAlbumPasswordSalt(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

export async function albumPasswordProof(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    iterations: ITERATIONS,
    salt: fromHex(salt) as BufferSource
  }, key, 256);
  return hex(new Uint8Array(bits));
}
