import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  CraftCardAward,
  CraftCardId,
  PanelRevision,
  RenderJob,
  Story,
  StoryStatus
} from "@maliang/domain";

export interface DataKeyProvider {
  getOrCreateKey(): Promise<Buffer>;
}

export interface SecureStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

/**
 * Electron's safeStorage is backed by the macOS Keychain. Only its encrypted
 * envelope is written to disk; the application data key is never stored raw.
 */
export class SafeStorageDataKeyProvider implements DataKeyProvider {
  constructor(
    private readonly envelopePath: string,
    private readonly secureStorage: SecureStorageAdapter
  ) {}

  async getOrCreateKey(): Promise<Buffer> {
    if (!this.secureStorage.isEncryptionAvailable()) {
      throw new Error("KEYCHAIN_UNAVAILABLE");
    }
    try {
      const envelope = await readFile(this.envelopePath);
      return Buffer.from(this.secureStorage.decryptString(envelope), "base64");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
    const key = randomBytes(32);
    await mkdir(dirname(this.envelopePath), { recursive: true, mode: 0o700 });
    const envelope = this.secureStorage.encryptString(key.toString("base64"));
    await writeFile(this.envelopePath, envelope, { mode: 0o600 });
    await chmod(this.envelopePath, 0o600);
    return key;
  }
}

/** Test-only provider. Production startup refuses to construct this provider. */
export class InMemoryDataKeyProvider implements DataKeyProvider {
  readonly #key = randomBytes(32);
  async getOrCreateKey(): Promise<Buffer> {
    return Buffer.from(this.#key);
  }
}

interface EncryptedEnvelope {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

function encrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope: EncryptedEnvelope = {
    version: 1,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
  return Buffer.from(JSON.stringify(envelope), "utf8");
}

function decrypt(envelopeBytes: Buffer, key: Buffer): Buffer {
  const envelope = JSON.parse(envelopeBytes.toString("utf8")) as EncryptedEnvelope;
  if (envelope.version !== 1) throw new Error("UNSUPPORTED_ENCRYPTION_VERSION");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(envelope.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final()
  ]);
}

export interface ArtifactRecord {
  id: string;
  kind: "RAW_IMAGE" | "COMPOSED_IMAGE" | "CHARACTER_REFERENCE" | "PDF";
  contentHash: string;
  encryptedPath: string;
  width: number | null;
  height: number | null;
  modelPolicyVersion: string;
  byteCount: number;
}

export interface CreateStoreOptions {
  rootDirectory: string;
  keyProvider: DataKeyProvider;
  now?: () => Date;
}

export interface StoredPanel {
  id: string;
  storyId: string;
  ordinal: number;
  currentRevisionId: string | null;
  currentArtifactId: string | null;
  storySpineSlot: string;
}

export interface StoredStory {
  story: Story;
  panels: StoredPanel[];
}

export class MaliangStore {
  readonly #db: DatabaseSync;
  readonly #root: string;
  readonly #artifactDirectory: string;
  readonly #keyProvider: DataKeyProvider;
  readonly #now: () => Date;

  private constructor(options: CreateStoreOptions, db: DatabaseSync) {
    this.#db = db;
    this.#root = options.rootDirectory;
    this.#artifactDirectory = join(this.#root, "artifacts");
    this.#keyProvider = options.keyProvider;
    this.#now = options.now ?? (() => new Date());
  }

  static async open(options: CreateStoreOptions): Promise<MaliangStore> {
    await mkdir(options.rootDirectory, { recursive: true, mode: 0o700 });
    await mkdir(join(options.rootDirectory, "artifacts"), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(join(options.rootDirectory, "maliang.sqlite"));
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    const store = new MaliangStore(options, db);
    store.#migrate();
    await options.keyProvider.getOrCreateKey();
    return store;
  }

  #migrate(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        title_ciphertext TEXT NOT NULL,
        author_ciphertext TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        style_version TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS panels (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        current_revision_id TEXT,
        current_artifact_id TEXT,
        story_spine_slot TEXT NOT NULL,
        UNIQUE(story_id, ordinal)
      );
      CREATE TABLE IF NOT EXISTS panel_revisions (
        id TEXT PRIMARY KEY,
        panel_id TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        source_text_ciphertext TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        origin TEXT NOT NULL,
        UNIQUE(panel_id, version)
      );
      CREATE TABLE IF NOT EXISTS scene_graphs (
        panel_revision_id TEXT PRIMARY KEY REFERENCES panel_revisions(id) ON DELETE CASCADE,
        schema_version INTEGER NOT NULL,
        extractor_version TEXT NOT NULL,
        validated_json_ciphertext TEXT NOT NULL,
        validation_report TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS render_contracts (
        id TEXT PRIMARY KEY,
        panel_revision_id TEXT NOT NULL REFERENCES panel_revisions(id) ON DELETE CASCADE,
        compiler_version TEXT NOT NULL,
        json_ciphertext TEXT NOT NULL,
        hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS render_jobs (
        id TEXT PRIMARY KEY,
        panel_id TEXT NOT NULL REFERENCES panels(id) ON DELETE CASCADE,
        revision_id TEXT NOT NULL REFERENCES panel_revisions(id) ON DELETE CASCADE,
        revision_version INTEGER NOT NULL,
        idempotency_key TEXT NOT NULL,
        state TEXT NOT NULL,
        attempt INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        error_code TEXT
      );
      CREATE INDEX IF NOT EXISTS render_jobs_cache
        ON render_jobs(idempotency_key, state);
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        content_hash TEXT NOT NULL UNIQUE,
        encrypted_path TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        model_policy_version TEXT NOT NULL,
        byte_count INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS render_cache (
        visual_hash TEXT PRIMARY KEY,
        raw_artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS story_artifacts (
        story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
        artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
        PRIMARY KEY(story_id, artifact_id)
      );
      CREATE TABLE IF NOT EXISTS local_learner_profiles (
        id TEXT PRIMARY KEY,
        display_label_ciphertext TEXT,
        created_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE TABLE IF NOT EXISTS craft_card_awards (
        id TEXT PRIMARY KEY,
        learner_profile_id TEXT NOT NULL REFERENCES local_learner_profiles(id) ON DELETE CASCADE,
        card_id TEXT NOT NULL,
        trigger_revision_id TEXT NOT NULL,
        resolving_revision_id TEXT NOT NULL,
        changed_evidence_ciphertext TEXT NOT NULL,
        state TEXT NOT NULL,
        earned_at TEXT NOT NULL,
        acknowledged_at TEXT,
        UNIQUE(learner_profile_id, card_id)
      );
    `);
  }

  async #encryptText(value: string): Promise<string> {
    const key = await this.#keyProvider.getOrCreateKey();
    return encrypt(Buffer.from(value, "utf8"), key).toString("base64");
  }

  async #decryptText(value: string): Promise<string> {
    const key = await this.#keyProvider.getOrCreateKey();
    return decrypt(Buffer.from(value, "base64"), key).toString("utf8");
  }

  async createStory(
    story: Story,
    panels: readonly {
      id: string;
      ordinal: number;
      storySpineSlot: string;
    }[]
  ): Promise<void> {
    const title = await this.#encryptText(story.title);
    const author = await this.#encryptText(story.authorDisplayName);
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare(`
        INSERT INTO stories
          (id, mode, title_ciphertext, author_ciphertext, created_at, updated_at, style_version, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        story.id,
        story.mode,
        title,
        author,
        story.createdAt,
        story.updatedAt,
        story.styleVersion,
        story.status
      );
      const insertPanel = this.#db.prepare(`
        INSERT INTO panels
          (id, story_id, ordinal, current_revision_id, current_artifact_id, story_spine_slot)
        VALUES (?, ?, ?, NULL, NULL, ?)
      `);
      for (const panel of panels) {
        insertPanel.run(panel.id, story.id, panel.ordinal, panel.storySpineSlot);
      }
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  async readStory(storyId: string): Promise<StoredStory | null> {
    const row = this.#db.prepare(`
      SELECT id, mode, title_ciphertext, author_ciphertext, created_at, updated_at,
             style_version, status
      FROM stories WHERE id = ?
    `).get(storyId) as {
      id: string;
      mode: Story["mode"];
      title_ciphertext: string;
      author_ciphertext: string;
      created_at: string;
      updated_at: string;
      style_version: string;
      status: StoryStatus;
    } | undefined;
    if (!row) return null;
    const panelRows = this.#db.prepare(`
      SELECT id, story_id, ordinal, current_revision_id, current_artifact_id, story_spine_slot
      FROM panels WHERE story_id = ? ORDER BY ordinal ASC
    `).all(storyId) as {
      id: string;
      story_id: string;
      ordinal: number;
      current_revision_id: string | null;
      current_artifact_id: string | null;
      story_spine_slot: string;
    }[];
    return {
      story: {
        id: row.id,
        mode: row.mode,
        title: await this.#decryptText(row.title_ciphertext),
        authorDisplayName: await this.#decryptText(row.author_ciphertext),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        styleVersion: row.style_version,
        status: row.status
      },
      panels: panelRows.map((panel) => ({
        id: panel.id,
        storyId: panel.story_id,
        ordinal: panel.ordinal,
        currentRevisionId: panel.current_revision_id,
        currentArtifactId: panel.current_artifact_id,
        storySpineSlot: panel.story_spine_slot
      }))
    };
  }

  async updateStoryTitle(storyId: string, title: string): Promise<void> {
    this.#db.prepare(`
      UPDATE stories SET title_ciphertext = ?, updated_at = ? WHERE id = ?
    `).run(
      await this.#encryptText(title),
      this.#now().toISOString(),
      storyId
    );
  }

  listStoryIds(): string[] {
    return (this.#db.prepare(
      "SELECT id FROM stories ORDER BY updated_at DESC"
    ).all() as { id: string }[]).map((row) => row.id);
  }

  async saveRevision(revision: PanelRevision): Promise<void> {
    const ciphertext = await this.#encryptText(revision.sourceText);
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare(`
        INSERT INTO panel_revisions
          (id, panel_id, version, source_text_ciphertext, source_hash, created_at, origin)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        revision.id,
        revision.panelId,
        revision.version,
        ciphertext,
        revision.sourceHash,
        revision.createdAt,
        revision.origin
      );
      this.#db.prepare(
        "UPDATE panels SET current_revision_id = ? WHERE id = ?"
      ).run(revision.id, revision.panelId);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  async readRevision(revisionId: string): Promise<PanelRevision | null> {
    const row = this.#db.prepare(`
      SELECT id, panel_id, version, source_text_ciphertext, source_hash, created_at, origin
      FROM panel_revisions
      WHERE id = ?
    `).get(revisionId) as {
      id: string;
      panel_id: string;
      version: number;
      source_text_ciphertext: string;
      source_hash: string;
      created_at: string;
      origin: "KEYBOARD" | "VOICE";
    } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      panelId: row.panel_id,
      version: row.version,
      sourceText: await this.#decryptText(row.source_text_ciphertext),
      sourceHash: row.source_hash,
      createdAt: row.created_at,
      origin: row.origin
    };
  }

  async saveSceneGraph(
    revisionId: string,
    graph: unknown,
    validationReport: unknown,
    extractorVersion: string
  ): Promise<void> {
    const graphCiphertext = await this.#encryptText(JSON.stringify(graph));
    this.#db.prepare(`
      INSERT INTO scene_graphs
        (panel_revision_id, schema_version, extractor_version, validated_json_ciphertext, validation_report)
      VALUES (?, 1, ?, ?, ?)
      ON CONFLICT(panel_revision_id) DO UPDATE SET
        extractor_version = excluded.extractor_version,
        validated_json_ciphertext = excluded.validated_json_ciphertext,
        validation_report = excluded.validation_report
    `).run(revisionId, extractorVersion, graphCiphertext, JSON.stringify(validationReport));
  }

  async readSceneGraph<T>(revisionId: string): Promise<T | null> {
    const row = this.#db.prepare(`
      SELECT validated_json_ciphertext
      FROM scene_graphs
      WHERE panel_revision_id = ?
    `).get(revisionId) as { validated_json_ciphertext: string } | undefined;
    if (!row) return null;
    return JSON.parse(await this.#decryptText(row.validated_json_ciphertext)) as T;
  }

  async saveRenderContract(
    revisionId: string,
    contract: unknown,
    compilerVersion: string,
    hash: string
  ): Promise<string> {
    const id = randomUUID();
    const ciphertext = await this.#encryptText(JSON.stringify(contract));
    this.#db.prepare(`
      INSERT INTO render_contracts
        (id, panel_revision_id, compiler_version, json_ciphertext, hash)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, revisionId, compilerVersion, ciphertext, hash);
    return id;
  }

  async readRenderContract<T>(revisionId: string): Promise<T | null> {
    const row = this.#db.prepare(`
      SELECT json_ciphertext
      FROM render_contracts
      WHERE panel_revision_id = ?
      ORDER BY rowid DESC
      LIMIT 1
    `).get(revisionId) as { json_ciphertext: string } | undefined;
    if (!row) return null;
    return JSON.parse(await this.#decryptText(row.json_ciphertext)) as T;
  }

  async readValidatedStateBySourceHash<TGraph, TContract>(
    panelId: string,
    sourceHash: string,
    excludingRevisionId: string
  ): Promise<{ graph: TGraph; contract: TContract } | null> {
    const row = this.#db.prepare(`
      SELECT sg.validated_json_ciphertext, rc.json_ciphertext
      FROM panel_revisions pr
      JOIN scene_graphs sg ON sg.panel_revision_id = pr.id
      JOIN render_contracts rc ON rc.panel_revision_id = pr.id
      WHERE pr.panel_id = ?
        AND pr.source_hash = ?
        AND pr.id <> ?
      ORDER BY pr.version DESC, rc.rowid DESC
      LIMIT 1
    `).get(
      panelId,
      sourceHash,
      excludingRevisionId
    ) as {
      validated_json_ciphertext: string;
      json_ciphertext: string;
    } | undefined;
    if (!row) return null;
    return {
      graph: JSON.parse(
        await this.#decryptText(row.validated_json_ciphertext)
      ) as TGraph,
      contract: JSON.parse(
        await this.#decryptText(row.json_ciphertext)
      ) as TContract
    };
  }

  saveRenderJob(job: RenderJob): void {
    this.#db.prepare(`
      INSERT INTO render_jobs
        (id, panel_id, revision_id, revision_version, idempotency_key, state, attempt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.panelId,
      job.revisionId,
      job.revisionVersion,
      job.idempotencyKey,
      job.state,
      job.attempt,
      job.createdAt,
      job.createdAt
    );
  }

  nextRenderJobAttempt(revisionId: string): number {
    const row = this.#db.prepare(`
      SELECT COALESCE(MAX(attempt), 0) AS attempt
      FROM render_jobs
      WHERE revision_id = ?
    `).get(revisionId) as { attempt: number };
    return row.attempt + 1;
  }

  updateRenderJobState(jobId: string, state: RenderJob["state"], errorCode?: string): void {
    this.#db.prepare(`
      UPDATE render_jobs SET state = ?, updated_at = ?, error_code = ? WHERE id = ?
    `).run(state, this.#now().toISOString(), errorCode ?? null, jobId);
  }

  recoverInterruptedRenderJobs(): number {
    const result = this.#db.prepare(`
      UPDATE render_jobs
      SET state = 'FAILED', updated_at = ?, error_code = 'PROCESS_INTERRUPTED'
      WHERE state NOT IN (
        'READY',
        'SUPERSEDED',
        'AUTH_REQUIRED',
        'USAGE_LIMIT',
        'TIMED_OUT',
        'FAILED',
        'BLOCKED'
      )
    `).run(this.#now().toISOString());
    return Number(result.changes);
  }

  readLatestRenderJob(
    revisionId: string
  ): { state: RenderJob["state"]; errorCode: string | null } | null {
    const row = this.#db.prepare(`
      SELECT state, error_code
      FROM render_jobs
      WHERE revision_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(revisionId) as { state: RenderJob["state"]; error_code: string | null } | undefined;
    return row
      ? {
          state: row.state,
          errorCode: row.error_code
        }
      : null;
  }

  updateRenderJobIdempotency(jobId: string, idempotencyKey: string): void {
    this.#db.prepare(`
      UPDATE render_jobs SET idempotency_key = ?, updated_at = ? WHERE id = ?
    `).run(idempotencyKey, this.#now().toISOString(), jobId);
  }

  setCurrentArtifactIfRevision(
    panelId: string,
    revisionId: string,
    artifactId: string
  ): boolean {
    const result = this.#db.prepare(`
      UPDATE panels
      SET current_artifact_id = ?
      WHERE id = ? AND current_revision_id = ?
    `).run(artifactId, panelId, revisionId);
    return result.changes === 1;
  }

  async putArtifact(
    storyId: string,
    input: Omit<ArtifactRecord, "id" | "contentHash" | "encryptedPath" | "byteCount"> & {
      bytes: Buffer;
    }
  ): Promise<ArtifactRecord> {
    const contentHash = `sha256:${createHash("sha256").update(input.bytes).digest("hex")}`;
    const existing = this.#db.prepare(
      "SELECT * FROM artifacts WHERE content_hash = ?"
    ).get(contentHash) as Record<string, unknown> | undefined;
    if (existing) {
      this.#db.prepare(
        "INSERT OR IGNORE INTO story_artifacts (story_id, artifact_id) VALUES (?, ?)"
      ).run(storyId, existing.id as string);
      return this.#artifactFromRow(existing);
    }

    const key = await this.#keyProvider.getOrCreateKey();
    const encrypted = encrypt(input.bytes, key);
    const name = contentHash.slice("sha256:".length);
    const finalPath = join(this.#artifactDirectory, `${name}.enc`);
    const temporaryPath = `${finalPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, encrypted, { mode: 0o600 });
    await rename(temporaryPath, finalPath);
    const artifact: ArtifactRecord = {
      id: randomUUID(),
      kind: input.kind,
      contentHash,
      encryptedPath: finalPath,
      width: input.width,
      height: input.height,
      modelPolicyVersion: input.modelPolicyVersion,
      byteCount: input.bytes.byteLength
    };
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare(`
        INSERT INTO artifacts
          (id, kind, content_hash, encrypted_path, width, height, model_policy_version, byte_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        artifact.id,
        artifact.kind,
        artifact.contentHash,
        artifact.encryptedPath,
        artifact.width,
        artifact.height,
        artifact.modelPolicyVersion,
        artifact.byteCount
      );
      this.#db.prepare(
        "INSERT INTO story_artifacts (story_id, artifact_id) VALUES (?, ?)"
      ).run(storyId, artifact.id);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      await rm(finalPath, { force: true });
      throw error;
    }
    return artifact;
  }

  #artifactFromRow(row: Record<string, unknown>): ArtifactRecord {
    return {
      id: row.id as string,
      kind: row.kind as ArtifactRecord["kind"],
      contentHash: row.content_hash as string,
      encryptedPath: row.encrypted_path as string,
      width: row.width as number | null,
      height: row.height as number | null,
      modelPolicyVersion: row.model_policy_version as string,
      byteCount: row.byte_count as number
    };
  }

  async readArtifact(artifactId: string): Promise<Buffer | null> {
    const row = this.#db.prepare(
      "SELECT encrypted_path FROM artifacts WHERE id = ?"
    ).get(artifactId) as { encrypted_path: string } | undefined;
    if (!row) return null;
    const key = await this.#keyProvider.getOrCreateKey();
    return decrypt(await readFile(row.encrypted_path), key);
  }

  saveRenderCache(visualHash: string, rawArtifactId: string): void {
    this.#db.prepare(`
      INSERT INTO render_cache (visual_hash, raw_artifact_id, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(visual_hash) DO UPDATE SET
        raw_artifact_id = excluded.raw_artifact_id,
        created_at = excluded.created_at
    `).run(visualHash, rawArtifactId, this.#now().toISOString());
  }

  async readRenderCache(
    visualHash: string
  ): Promise<{ artifact: ArtifactRecord; bytes: Buffer } | null> {
    const row = this.#db.prepare(`
      SELECT a.*
      FROM render_cache rc
      JOIN artifacts a ON a.id = rc.raw_artifact_id
      WHERE rc.visual_hash = ? AND a.kind = 'RAW_IMAGE'
    `).get(visualHash) as Record<string, unknown> | undefined;
    if (!row) return null;
    const artifact = this.#artifactFromRow(row);
    const bytes = await this.readArtifact(artifact.id);
    return bytes ? { artifact, bytes } : null;
  }

  createLearnerProfile(displayLabel?: string): Promise<string> {
    return this.#createLearnerProfile(displayLabel);
  }

  async #createLearnerProfile(displayLabel?: string): Promise<string> {
    const id = randomUUID();
    const ciphertext = displayLabel ? await this.#encryptText(displayLabel) : null;
    this.#db.prepare(`
      INSERT INTO local_learner_profiles
        (id, display_label_ciphertext, created_at, deleted_at)
      VALUES (?, ?, ?, NULL)
    `).run(id, ciphertext, this.#now().toISOString());
    return id;
  }

  async insertAwards(awards: readonly CraftCardAward[]): Promise<void> {
    if (awards.length === 0) return;
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const insert = this.#db.prepare(`
        INSERT OR IGNORE INTO craft_card_awards
          (id, learner_profile_id, card_id, trigger_revision_id, resolving_revision_id,
           changed_evidence_ciphertext, state, earned_at, acknowledged_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const award of awards) {
        insert.run(
          award.id,
          award.learnerProfileId,
          award.cardId,
          award.triggerRevisionId,
          award.resolvingRevisionId,
          await this.#encryptText(JSON.stringify(award.changedEvidence)),
          award.state,
          award.earnedAt,
          award.acknowledgedAt
        );
      }
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  acknowledgeAward(awardId: string): void {
    this.#db.prepare(`
      UPDATE craft_card_awards
      SET state = 'ACKNOWLEDGED', acknowledged_at = ?
      WHERE id = ? AND state = 'PENDING'
    `).run(this.#now().toISOString(), awardId);
  }

  earnedCardIds(profileId: string): Set<CraftCardId> {
    const rows = this.#db.prepare(
      "SELECT card_id FROM craft_card_awards WHERE learner_profile_id = ?"
    ).all(profileId) as { card_id: CraftCardId }[];
    return new Set(rows.map((row) => row.card_id));
  }

  firstLearnerProfileId(): string | null {
    const row = this.#db.prepare(`
      SELECT id FROM local_learner_profiles
      WHERE deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    `).get() as { id: string } | undefined;
    return row?.id ?? null;
  }

  async readAwards(profileId: string): Promise<CraftCardAward[]> {
    const rows = this.#db.prepare(`
      SELECT id, learner_profile_id, card_id, trigger_revision_id,
             resolving_revision_id, changed_evidence_ciphertext, state,
             earned_at, acknowledged_at
      FROM craft_card_awards
      WHERE learner_profile_id = ?
      ORDER BY earned_at ASC
    `).all(profileId) as {
      id: string;
      learner_profile_id: string;
      card_id: CraftCardId;
      trigger_revision_id: string;
      resolving_revision_id: string;
      changed_evidence_ciphertext: string;
      state: CraftCardAward["state"];
      earned_at: string;
      acknowledged_at: string | null;
    }[];
    return Promise.all(rows.map(async (row) => ({
      id: row.id,
      learnerProfileId: row.learner_profile_id,
      cardId: row.card_id,
      triggerRevisionId: row.trigger_revision_id,
      resolvingRevisionId: row.resolving_revision_id,
      changedEvidence: JSON.parse(
        await this.#decryptText(row.changed_evidence_ciphertext)
      ) as CraftCardAward["changedEvidence"],
      state: row.state,
      earnedAt: row.earned_at,
      acknowledgedAt: row.acknowledged_at
    })));
  }

  async deleteStory(storyId: string): Promise<void> {
    const rows = this.#db.prepare(`
      SELECT a.id, a.encrypted_path
      FROM artifacts a
      JOIN story_artifacts sa ON sa.artifact_id = a.id
      WHERE sa.story_id = ?
    `).all(storyId) as { id: string; encrypted_path: string }[];
    this.#db.prepare("DELETE FROM stories WHERE id = ?").run(storyId);
    for (const artifact of rows) {
      const reference = this.#db.prepare(
        "SELECT 1 FROM story_artifacts WHERE artifact_id = ? LIMIT 1"
      ).get(artifact.id);
      if (reference) continue;
      this.#db.prepare("DELETE FROM artifacts WHERE id = ?").run(artifact.id);
      await rm(artifact.encrypted_path, { force: true });
    }
  }

  async deleteAllData(): Promise<void> {
    this.#db.close();
    await rm(this.#root, { recursive: true, force: true });
  }

  close(): void {
    this.#db.close();
  }
}
