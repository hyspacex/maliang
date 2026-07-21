// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoryView } from "@maliang/domain";
import type { MainToRendererEvent } from "../apps/desktop/main/index";
import type { MaliangRendererBridge } from "../apps/desktop/preload/index";
import { MaliangApp } from "../apps/desktop/renderer/src/MaliangApp";

afterEach(() => {
  cleanup();
  delete window.maliang;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function weakStory(): StoryView {
  const now = "2026-07-20T12:00:00.000Z";
  const panels = Array.from({ length: 6 }, (_, index) => ({
    panelId: `panel-${index + 1}`,
    ordinal: index + 1,
    storySpineSlot: ["WHO & WHERE", "UH-OH!", "TRY #1", "TRY #2", "THE BIG MOMENT", "THE END"][index] ?? "",
    sourceText: index === 0 ? "Mara waits." : "",
    revisionVersion: index === 0 ? 1 : 0,
    visualState: index === 0 ? "pencil" as const : "empty" as const,
    diagnosticCode: index === 0 ? "GENERIC_OR_MISSING_ACTION" as const : null,
    diagnosticCodes: index === 0
      ? [
          "GENERIC_OR_MISSING_ACTION" as const,
          "MISSING_APPEARANCE_DETAIL" as const,
          "SETTING_UNDERSPECIFIED" as const
        ]
      : [],
    artifactUrl: null
  }));
  return {
    story: {
      id: "story-1",
      mode: "AUTHOR",
      title: "MY COMIC",
      authorDisplayName: "you",
      createdAt: now,
      updatedAt: now,
      styleVersion: "comic-pencil-ink/v1",
      status: "DRAFT"
    },
    panels,
    selectedPanelId: "panel-1"
  };
}

function bridgeFor(story: StoryView): {
  bridge: MaliangRendererBridge;
  updatePanelText: ReturnType<typeof vi.fn>;
  emit: (event: MainToRendererEvent) => void;
} {
  let listener: ((event: MainToRendererEvent) => void) | null = null;
  const updatePanelText = vi.fn(async (input: {
    panelId: string;
    text: string;
    baseVersion: number;
  }) => ({
    panelId: input.panelId,
    revisionId: "revision-2",
    version: input.baseVersion + 1,
    sourceText: input.text,
    state: "drawing" as const
  }));
  const bridge = {
    createStory: vi.fn(async () => story),
    listStories: vi.fn(async () => [story.story.id]),
    loadStory: vi.fn(async () => story),
    updateStoryTitle: vi.fn(async () => undefined),
    deleteStory: vi.fn(async () => undefined),
    exportPdf: vi.fn(async () => true),
    updatePanelText,
    retryRender: vi.fn(async () => undefined),
    readDeck: vi.fn(async () => ({
      learnerProfileId: "learner-1",
      earnedCardIds: [],
      pendingAwards: []
    })),
    acknowledgeAward: vi.fn(async () => ({
      learnerProfileId: "learner-1",
      earnedCardIds: [],
      pendingAwards: []
    })),
    capability: vi.fn(async () => ({
      ready: true,
      reason: "READY" as const,
      installedVersion: "0.144.5",
      requiredVersion: ">=0.144.5 <0.146.0"
    })),
    startVoice: vi.fn(async () => undefined),
    stopVoice: vi.fn(async () => undefined),
    startComplaint: vi.fn(async () => undefined),
    stopComplaint: vi.fn(async () => undefined),
    onEvent: vi.fn((next: (event: MainToRendererEvent) => void) => {
      listener = next;
      return () => {
        listener = null;
      };
    })
  } satisfies MaliangRendererBridge;
  return {
    bridge,
    updatePanelText,
    emit: (event) => listener?.(event)
  };
}

describe("Maliang production UI", () => {
  it("uses the Maliang brand and renders the six-panel visual contract", async () => {
    render(<MaliangApp />);
    expect(await screen.findByText("MALIANG")).toBeInTheDocument();
    expect(screen.queryByText(/INKLING/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /MY CARDS 0\/6/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /FINISH IT/i })).toBeDisabled();
    expect(screen.getAllByRole("textbox")).toHaveLength(7);
    expect(screen.getAllByRole("button", { name: /Panel \d, empty/i })).toHaveLength(6);
  });

  it("invites a weak first attempt without changing or grading the child's words", async () => {
    const story = weakStory();
    const harness = bridgeFor(story);
    window.maliang = harness.bridge;
    render(<MaliangApp />);

    expect(
      await screen.findByText("Some of this is still pencil. Is that how you pictured it?")
    ).toBeInTheDocument();
    const editor = screen.getByLabelText(/Panel 1: WHO & WHERE/i);
    expect(editor).toHaveValue("Mara waits.");
    expect(screen.queryByText(/bad writing|weak writing|score|grade/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "YES — KEEP IT" }));
    expect(editor).toHaveValue("Mara waits.");
    expect(harness.updatePanelText).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "CHECK THIS PICTURE" })).toBeInTheDocument();
    act(() => harness.emit({
      type: "complaint.diagnostic",
      panelId: "panel-1",
      revisionVersion: 0,
      diagnosticCode: "INTERNAL_STATE_NOT_VISIBLE"
    }));
    expect(screen.queryByText("What could someone notice from the outside?")).not.toBeInTheDocument();
  });

  it("asks one neutral question, waits for a child edit, then compares the result", async () => {
    const story = weakStory();
    const harness = bridgeFor(story);
    window.maliang = harness.bridge;
    render(<MaliangApp />);

    await screen.findByText("Some of this is still pencil. Is that how you pictured it?");
    fireEvent.click(screen.getByRole("button", { name: "NOT YET" }));
    expect(screen.getByText("Which part do you want to think about first?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    expect(screen.getByText("What do you notice about how it looks?")).toBeInTheDocument();
    expect(screen.getByText(/Maliang will not add words/i)).toBeInTheDocument();
    expect(harness.updatePanelText).not.toHaveBeenCalled();

    const editor = screen.getByLabelText(/Panel 1: WHO & WHERE/i);
    vi.useFakeTimers();
    fireEvent.change(editor, { target: { value: "Tiny Mara waits." } });
    expect(editor).toHaveValue("Tiny Mara waits.");
    expect(screen.getByText(/The next picture will use only your words/i)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });
    expect(harness.updatePanelText).toHaveBeenCalledWith({
      panelId: "panel-1",
      baseVersion: 1,
      text: "Tiny Mara waits.",
      origin: "KEYBOARD"
    });

    act(() => harness.emit({
      type: "panel.state",
      panelId: "panel-1",
      revisionVersion: 2,
      state: "partial",
      artifactUrl: null,
      diagnosticCode: "SETTING_UNDERSPECIFIED",
      diagnosticCodes: ["SETTING_UNDERSPECIFIED"]
    }));
    expect(
      screen.getByText("Your words changed what the picture can show. Is it closer to what you imagined?")
    ).toBeInTheDocument();
    expect(editor).toHaveValue("Tiny Mara waits.");
  });
});
