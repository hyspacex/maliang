import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { access } from "node:fs/promises";
import { constants as fileConstants } from "node:fs";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  safeStorage,
  session
} from "electron";
import { z } from "zod";
import { MALIANG_BRAND } from "@maliang/domain";
import {
  CodexSubprocessGateway,
  loadOpenAIKeyFromEnvFile,
  OpenAIImageApiGateway,
  sniffImage,
  type CodexGateway
} from "@maliang/codex-gateway";
import {
  MaliangStore,
  SafeStorageDataKeyProvider
} from "@maliang/local-store";
import {
  ApplicationController,
  type ControllerEvent,
  type RendererMode
} from "./controller.js";
import {
  SpeechHelperClient,
  type SpeechHelperEvent,
  type SpeechRequestContext
} from "./speech-helper-client.js";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "maliang-artifact",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
      bypassCSP: false
    }
  }
]);

const createStorySchema = z.object({
  mode: z.enum(["GYM", "AUTHOR"]),
  title: z.string().max(100),
  authorDisplayName: z.string().max(80).optional()
}).strict();

const updatePanelSchema = z.object({
  panelId: z.string().uuid(),
  baseVersion: z.number().int().nonnegative(),
  text: z.string().max(4_000),
  origin: z.enum(["KEYBOARD", "VOICE"])
}).strict();

const uuidSchema = z.string().uuid();

let store: MaliangStore;
let controller: ApplicationController;
let mainWindow: BrowserWindow | null = null;
let speechHelper: SpeechHelperClient | null = null;

async function reviewedCodexPath(): Promise<string> {
  if (process.platform !== "darwin") return "codex";
  const bundledPath = "/Applications/ChatGPT.app/Contents/Resources/codex";
  try {
    await access(bundledPath, fileConstants.X_OK);
    return bundledPath;
  } catch {
    return "codex";
  }
}

function configuredRendererMode(): RendererMode {
  const value = process.env.MALIANG_RENDERER ?? MALIANG_BRAND.defaultRenderer;
  if (value === "raster" || value === "vector" || value === "openai-api") {
    return value;
  }
  throw new Error(
    "MALIANG_RENDERER must be raster, vector, or openai-api."
  );
}

export type MainToRendererEvent =
  | ControllerEvent
  | {
      type: "speech.state";
      panelId: string;
      mode: "draft" | "complaint";
      state: "started" | "stopped" | "error";
      code?: string;
    }
  | {
      type: "voice.transcript";
      panelId: string;
      transcript: string;
      isFinal: boolean;
    }
  | {
      type: "complaint.diagnostic";
      panelId: string;
      revisionVersion: number;
      diagnosticCode: import("@maliang/domain").DiagnosticCode;
    };

function broadcast(event: MainToRendererEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("maliang:event", event);
  }
}

function registerIpc(): void {
  ipcMain.handle("story:create", (_event, input: unknown) => {
    const parsed = createStorySchema.parse(input);
    return controller.createStory({
      mode: parsed.mode,
      title: parsed.title,
      ...(parsed.authorDisplayName === undefined
        ? {}
        : { authorDisplayName: parsed.authorDisplayName })
    });
  });
  ipcMain.handle("story:list", () => controller.listStoryIds());
  ipcMain.handle("story:load", (_event, storyId: unknown) =>
    controller.loadStory(uuidSchema.parse(storyId))
  );
  ipcMain.handle(
    "story:updateTitle",
    (_event, storyId: unknown, title: unknown) =>
      controller.updateStoryTitle(
        uuidSchema.parse(storyId),
        z.string().max(100).parse(title)
      )
  );
  ipcMain.handle(
    "story:delete",
    async (_event, storyId: unknown, parentGate: unknown) => {
      z.object({ confirmed: z.literal(true) }).strict().parse(parentGate);
      await controller.deleteStory(uuidSchema.parse(storyId));
    }
  );
  ipcMain.handle("story:exportPdf", async (event, storyId: unknown) => {
    uuidSchema.parse(storyId);
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) throw new Error("WINDOW_NOT_FOUND");
    const destination = await dialog.showSaveDialog(owner, {
      title: "Save your Maliang comic",
      defaultPath: "maliang-comic.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });
    if (destination.canceled || !destination.filePath) return false;
    const bytes = await owner.webContents.printToPDF({
      printBackground: true,
      pageSize: "Letter",
      margins: { marginType: "printableArea" }
    });
    const { writeFile } = await import("node:fs/promises");
    await writeFile(destination.filePath, bytes, { mode: 0o600 });
    return true;
  });
  ipcMain.handle("panel:updateText", (_event, input: unknown) =>
    controller.updatePanelText(updatePanelSchema.parse(input))
  );
  ipcMain.handle("panel:retryRender", (_event, panelId: unknown) =>
    controller.retryRender(uuidSchema.parse(panelId))
  );
  ipcMain.handle("cards:readDeck", () => controller.readDeck());
  ipcMain.handle("cards:acknowledgeAward", (_event, awardId: unknown) =>
    controller.acknowledgeAward(uuidSchema.parse(awardId))
  );
  ipcMain.handle("capability:read", () => controller.capability());
  ipcMain.handle("voice:start", (_event, panelId: unknown) => {
    speechHelper?.start(uuidSchema.parse(panelId), "draft");
  });
  ipcMain.handle("voice:stop", (_event, panelId: unknown) => {
    speechHelper?.stop(uuidSchema.parse(panelId));
  });
  ipcMain.handle("complaint:start", (_event, panelId: unknown) => {
    speechHelper?.start(uuidSchema.parse(panelId), "complaint");
  });
  ipcMain.handle("complaint:stop", (_event, panelId: unknown) => {
    speechHelper?.stop(uuidSchema.parse(panelId));
  });
}

function onSpeechEvent(
  event: SpeechHelperEvent,
  context: SpeechRequestContext
): void {
  if (event.type === "transcript" && event.transcript !== undefined) {
    if (context.mode === "draft") {
      broadcast({
        type: "voice.transcript",
        panelId: context.panelId,
        transcript: event.transcript,
        isFinal: event.isFinal ?? false
      });
    } else if (event.isFinal) {
      void controller.diagnoseComplaint(context.panelId, event.transcript).then((diagnosis) => {
        if (!diagnosis) return;
        broadcast({
          type: "complaint.diagnostic",
          panelId: diagnosis.panelId,
          revisionVersion: diagnosis.revisionVersion,
          diagnosticCode: diagnosis.diagnosticCode
        });
      });
    }
    return;
  }
  if (event.type === "started" || event.type === "stopped" || event.type === "error") {
    broadcast({
      type: "speech.state",
      panelId: context.panelId,
      mode: context.mode,
      state: event.type,
      ...(event.code ? { code: event.code } : {})
    });
  }
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 720,
    minHeight: 650,
    backgroundColor: "#f6f1e3",
    title: "Maliang",
    webPreferences: {
      preload: join(app.getAppPath(), "dist", "desktop", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const allowed =
      url.startsWith("file:") ||
      (process.env.MALIANG_DEV_SERVER && url.startsWith(process.env.MALIANG_DEV_SERVER));
    if (!allowed) event.preventDefault();
  });
  if (process.env.MALIANG_DEV_SERVER) {
    await mainWindow.loadURL(process.env.MALIANG_DEV_SERVER);
  } else {
    await mainWindow.loadFile(join(app.getAppPath(), "dist", "renderer", "index.html"));
  }
}

app.whenReady().then(async () => {
  const rendererMode = configuredRendererMode();
  const dataRoot = join(app.getPath("userData"), "local-data");
  store = await MaliangStore.open({
    rootDirectory: dataRoot,
    keyProvider: new SafeStorageDataKeyProvider(
      join(app.getPath("userData"), "data-key.envelope"),
      safeStorage
    )
  });
  const codexGateway = new CodexSubprocessGateway({
    codexPath: await reviewedCodexPath(),
    jobsRoot: join(app.getPath("userData"), "codex-jobs"),
    keepSyntheticJobs: process.env.MALIANG_DEBUG_KEEP_CODEX_JOBS === "1"
  });
  let gateway: CodexGateway = codexGateway;
  if (rendererMode === "openai-api") {
    const apiKey = await loadOpenAIKeyFromEnvFile(
      process.env.MALIANG_OPENAI_ENV_FILE ?? join(process.cwd(), ".env")
    );
    gateway = new OpenAIImageApiGateway({ delegate: codexGateway, apiKey });
  }
  controller = new ApplicationController({
    store,
    gateway,
    emit: broadcast,
    rendererMode
  });
  await controller.initialize();
  const speechExecutable = app.isPackaged
    ? join(process.resourcesPath, "native", "maliang-speech-helper")
    : join(
        app.getAppPath(),
        "native",
        "speech-helper",
        ".build",
        "release",
        "maliang-speech-helper"
      );
  speechHelper = new SpeechHelperClient(speechExecutable, onSpeechEvent);

  protocol.handle("maliang-artifact", async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "artifact") return new Response("Not found", { status: 404 });
    const artifactId = url.pathname.slice(1);
    if (!uuidSchema.safeParse(artifactId).success) {
      return new Response("Not found", { status: 404 });
    }
    const bytes = await store.readArtifact(artifactId);
    if (!bytes) return new Response("Not found", { status: 404 });
    const mime = bytes.subarray(0, 64).toString("utf8").includes("<svg")
      ? "image/svg+xml"
      : sniffImage(bytes) ?? "application/octet-stream";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; img-src data:"
      }
    });
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  registerIpc();
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}).catch((error) => {
  dialog.showErrorBox("Maliang could not start", error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  speechHelper?.close();
  store?.close();
});
