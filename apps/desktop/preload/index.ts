import { contextBridge, ipcRenderer } from "electron";
import type {
  ChildSafeCapabilityView,
  CraftDeckView,
  CreateStoryInput,
  PanelRevisionView,
  StoryView,
  UpdatePanelTextInput
} from "@maliang/domain";
import type { MainToRendererEvent } from "../main/index.js";

export interface MaliangRendererBridge {
  createStory(input: CreateStoryInput): Promise<StoryView>;
  listStories(): Promise<string[]>;
  loadStory(storyId: string): Promise<StoryView>;
  updateStoryTitle(storyId: string, title: string): Promise<void>;
  deleteStory(storyId: string): Promise<void>;
  exportPdf(storyId: string): Promise<boolean>;
  updatePanelText(input: UpdatePanelTextInput): Promise<PanelRevisionView>;
  retryRender(panelId: string): Promise<void>;
  readDeck(): Promise<CraftDeckView>;
  acknowledgeAward(awardId: string): Promise<CraftDeckView>;
  capability(): Promise<ChildSafeCapabilityView>;
  startVoice(panelId: string): Promise<void>;
  stopVoice(panelId: string): Promise<void>;
  startComplaint(panelId: string): Promise<void>;
  stopComplaint(panelId: string): Promise<void>;
  onEvent(listener: (event: MainToRendererEvent) => void): () => void;
}

const bridge: MaliangRendererBridge = {
  createStory: (input) => ipcRenderer.invoke("story:create", input) as Promise<StoryView>,
  listStories: () => ipcRenderer.invoke("story:list") as Promise<string[]>,
  loadStory: (storyId) => ipcRenderer.invoke("story:load", storyId) as Promise<StoryView>,
  updateStoryTitle: (storyId, title) =>
    ipcRenderer.invoke("story:updateTitle", storyId, title) as Promise<void>,
  deleteStory: (storyId) =>
    ipcRenderer.invoke("story:delete", storyId, { confirmed: true }) as Promise<void>,
  exportPdf: (storyId) =>
    ipcRenderer.invoke("story:exportPdf", storyId) as Promise<boolean>,
  updatePanelText: (input) =>
    ipcRenderer.invoke("panel:updateText", input) as Promise<PanelRevisionView>,
  retryRender: (panelId) =>
    ipcRenderer.invoke("panel:retryRender", panelId) as Promise<void>,
  readDeck: () => ipcRenderer.invoke("cards:readDeck") as Promise<CraftDeckView>,
  acknowledgeAward: (awardId) =>
    ipcRenderer.invoke("cards:acknowledgeAward", awardId) as Promise<CraftDeckView>,
  capability: () =>
    ipcRenderer.invoke("capability:read") as Promise<ChildSafeCapabilityView>,
  startVoice: (panelId) => ipcRenderer.invoke("voice:start", panelId) as Promise<void>,
  stopVoice: (panelId) => ipcRenderer.invoke("voice:stop", panelId) as Promise<void>,
  startComplaint: (panelId) =>
    ipcRenderer.invoke("complaint:start", panelId) as Promise<void>,
  stopComplaint: (panelId) =>
    ipcRenderer.invoke("complaint:stop", panelId) as Promise<void>,
  onEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, value: MainToRendererEvent): void => {
      listener(value);
    };
    ipcRenderer.on("maliang:event", handler);
    return () => ipcRenderer.removeListener("maliang:event", handler);
  }
};

contextBridge.exposeInMainWorld("maliang", bridge);
