use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedCredential {
    pub id: String,
    pub origin: String,
    pub username: String,
    pub nonce_hex: String,
    pub ciphertext_hex: String,
}

pub struct CredentialVault {
    service_name: &'static str,
    entries: Vec<EncryptedCredential>,
}

impl CredentialVault {
    pub fn new() -> Self {
        Self {
            service_name: "ferrox-browser-vault",
            entries: Vec::new(),
        }
    }

    /// Derives a 256-bit AES key from OS keyring secret or user master passphrase.
    pub fn derive_key(master_secret: &str) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(b"ferrox-vault-v1:");
        hasher.update(master_secret.as_bytes());
        hasher.finalize().into()
    }

    pub fn store_master_key_in_os_keyring(&self, account: &str, secret: &str) -> Result<(), String> {
        let entry = Entry::new(self.service_name, account).map_err(|e| e.to_string())?;
        entry.set_password(secret).map_err(|e| e.to_string())
    }

    pub fn save_credential(
        &mut self,
        id: String,
        origin: String,
        username: String,
        plaintext_password: &str,
        key_bytes: &[u8; 32],
    ) -> Result<(), String> {
        let cipher = Aes256Gcm::new_from_slice(key_bytes).map_err(|e| e.to_string())?;
        let nonce_bytes: [u8; 12] = Sha256::digest(format!("{}:{}", origin, username).as_bytes())[..12]
            .try_into()
            .map_err(|_| "Nonce slice failure".to_string())?;
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, plaintext_password.as_bytes())
            .map_err(|e| e.to_string())?;

        self.entries.push(EncryptedCredential {
            id,
            origin,
            username,
            nonce_hex: hex_encode(&nonce_bytes),
            ciphertext_hex: hex_encode(&ciphertext),
        });
        Ok(())
    }

    pub fn entries(&self) -> &[EncryptedCredential] {
        &self.entries
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}
