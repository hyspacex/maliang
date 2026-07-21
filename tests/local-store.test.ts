import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryDataKeyProvider, MaliangStore } from "@maliang/local-store";
import type { Story } from "@maliang/domain";
import { hashSource } from "@maliang/scene-validator";

const roots: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("MaliangStore", () => {
  it("encrypts story text and artifacts at rest, then deletes all run data", async () => {
    const root = join(tmpdir(), `maliang-store-${randomUUID()}`);
    roots.push(root);
    const keyProvider = new InMemoryDataKeyProvider();
    let store = await MaliangStore.open({
      rootDirectory: root,
      keyProvider
    });
    const now = new Date("2026-07-16T00:00:00Z").toISOString();
    const story: Story = {
      id: randomUUID(),
      mode: "AUTHOR",
      title: "Secret story title",
      authorDisplayName: "Local author",
      createdAt: now,
      updatedAt: now,
      styleVersion: "v1",
      status: "DRAFT"
    };
    const panelId = randomUUID();
    await store.createStory(story, [{ id: panelId, ordinal: 1, storySpineSlot: "WHO & WHERE" }]);
    const text = "Mara keeps the exact child-authored words.";
    const revisionId = randomUUID();
    await store.saveRevision({
      id: revisionId,
      panelId,
      version: 1,
      sourceText: text,
      sourceHash: hashSource(text),
      createdAt: now,
      origin: "KEYBOARD"
    });
    const renderJobId = randomUUID();
    store.saveRenderJob({
      id: renderJobId,
      panelId,
      revisionId,
      revisionVersion: 1,
      idempotencyKey: hashSource(text),
      state: "SAFETY_CHECKING",
      attempt: 1,
      createdAt: now
    });
    expect(store.recoverInterruptedRenderJobs()).toBe(1);
    expect(store.recoverInterruptedRenderJobs()).toBe(0);
    expect(store.readLatestRenderJob(revisionId)).toEqual({
      state: "FAILED",
      errorCode: "PROCESS_INTERRUPTED"
    });
    const artifact = await store.putArtifact(story.id, {
      kind: "RAW_IMAGE",
      bytes: Buffer.from("synthetic image bytes"),
      width: 1,
      height: 1,
      modelPolicyVersion: "fixture"
    });
    const dbBytes = await readFile(join(root, "maliang.sqlite"));
    expect(dbBytes.includes(Buffer.from(text))).toBe(false);
    const encryptedArtifact = await readFile(artifact.encryptedPath);
    expect(encryptedArtifact.includes(Buffer.from("synthetic image bytes"))).toBe(false);
    expect((await store.readRevision(revisionId))?.sourceText).toBe(text);
    expect((await store.readArtifact(artifact.id))?.toString()).toBe("synthetic image bytes");
    const graph = { schemaVersion: 1, marker: "validated graph" };
    const contract = { contractVersion: 1, marker: "compiled contract" };
    await store.saveSceneGraph(revisionId, graph, { valid: true }, "test-extractor");
    await store.saveRenderContract(
      revisionId,
      contract,
      "test-compiler",
      "sha256:contract"
    );
    store.saveRenderCache("sha256:visual", artifact.id);
    store.close();

    store = await MaliangStore.open({
      rootDirectory: root,
      keyProvider
    });
    await expect(store.readSceneGraph(revisionId)).resolves.toEqual(graph);
    await expect(store.readRenderContract(revisionId)).resolves.toEqual(contract);
    await expect(
      store.readValidatedStateBySourceHash(
        panelId,
        hashSource(text),
        randomUUID()
      )
    ).resolves.toEqual({ graph, contract });
    await expect(store.readRenderCache("sha256:visual")).resolves.toMatchObject({
      artifact: { id: artifact.id },
      bytes: Buffer.from("synthetic image bytes")
    });
    await store.deleteAllData();
    await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
    roots.splice(roots.indexOf(root), 1);
  });
});
