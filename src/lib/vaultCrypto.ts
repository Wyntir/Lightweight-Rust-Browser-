export interface VaultCredential {
  id: string;
  site: string;
  username: string;
  password: string;
  updatedAt: number;
}

export interface EncryptedVaultPayload {
  version: 1;
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
}

function getCrypto(): Crypto {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  throw new Error('Web Crypto API is unavailable in this environment.');
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const cryptoApi = getCrypto();
  const enc = new TextEncoder();
  const baseKey = await cryptoApi.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return cryptoApi.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptVaultCredentials(
  credentials: VaultCredential[],
  passphrase: string
): Promise<EncryptedVaultPayload> {
  const cryptoApi = getCrypto();
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(credentials));

  const encryptedBuffer = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    encoded
  );

  return {
    version: 1,
    saltBase64: toBase64(salt),
    ivBase64: toBase64(iv),
    ciphertextBase64: toBase64(new Uint8Array(encryptedBuffer)),
  };
}

export async function decryptVaultCredentials(
  payload: EncryptedVaultPayload,
  passphrase: string
): Promise<VaultCredential[]> {
  const cryptoApi = getCrypto();
  const salt = fromBase64(payload.saltBase64);
  const iv = fromBase64(payload.ivBase64);
  const ciphertext = fromBase64(payload.ciphertextBase64);
  const key = await deriveAesKey(passphrase, salt);

  const decryptedBuffer = await cryptoApi.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource
  );

  const raw = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(raw) as VaultCredential[];
}
