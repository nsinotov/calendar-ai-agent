import type { BillingStore } from "../billing/billing-store.js";
import { SqliteBillingStore } from "../billing/billing-store.js";
import type { ActivityMemoryStore } from "../memory/activity-memory-store.js";
import { SqliteActivityMemoryStore } from "../memory/activity-memory-store.js";
import type { ConversationStore } from "../memory/conversation-store.js";
import { SqliteConversationStore } from "../memory/conversation-store.js";
import type { PreferencesStore } from "../memory/preferences-store.js";
import { SqlitePreferencesStore } from "../memory/preferences-store.js";
import type { UserSettingsStore } from "../memory/user-settings-store.js";
import { SqliteUserSettingsStore } from "../memory/user-settings-store.js";
import type { UserStore } from "../memory/user-store.js";
import { SqliteUserStore } from "../memory/user-store.js";
import type { NotesProvider } from "../notes/index.js";
import { createNotesProvider } from "../notes/index.js";
import { loadEncryptionKey } from "../secrets/crypto.js";
import type { UserSecretsStore } from "../secrets/user-secrets-store.js";
import { SqliteUserSecretsStore } from "../secrets/user-secrets-store.js";
import { openDatabase } from "./database.js";

// `provider` is the identifier from env; the factory below decides what it means.
export interface StorageConfig {
  provider: string;
  dataDir: string;
  encryptionKeyHex: string;
}

export interface Storage {
  users: UserStore;
  settings: UserSettingsStore;
  conversations: ConversationStore;
  preferences: PreferencesStore;
  activity: ActivityMemoryStore;
  secrets: UserSecretsStore;
  notes: NotesProvider;
  billing: BillingStore;
  close(): void;
}

export function createStorage(config: StorageConfig): Storage {
  switch (config.provider) {
    case "sqlite": {
      const db = openDatabase(config.dataDir);

      return {
        users: new SqliteUserStore(db),
        settings: new SqliteUserSettingsStore(db),
        conversations: new SqliteConversationStore(db),
        preferences: new SqlitePreferencesStore(db),
        activity: new SqliteActivityMemoryStore(db),
        secrets: new SqliteUserSecretsStore(db, loadEncryptionKey(config.encryptionKeyHex)),
        notes: createNotesProvider(db),
        billing: new SqliteBillingStore(db),
        close: () => db.close(),
      };
    }
    default:
      throw new Error(`Unknown storage provider: "${config.provider}"`);
  }
}

