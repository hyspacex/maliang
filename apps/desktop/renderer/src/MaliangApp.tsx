import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react";
import {
  MALIANG_BRAND,
  type ChildSafeCapabilityView,
  type CraftCardAward,
  type CraftCardId,
  type DiagnosticCode,
  type PanelVisualState,
  type StoryPanelView,
  type StoryView
} from "@maliang/domain";
import {
  COACHING_CATALOG,
  coachingMessage,
  revisionCoachingCodes
} from "@maliang/coaching-catalog";
import { CRAFT_CARD_CATALOG } from "@maliang/craft-cards/catalog";

const PANEL_PLACEHOLDERS = [
  "Who is your story about? Where are they?",
  "What goes wrong?",
  "How do they try to fix it?",
  "They try again — bigger this time!",
  "The biggest moment of the whole story!",
  "How does it all end?"
] as const;

const STATUS_LABEL: Readonly<Record<PanelVisualState, string>> = {
  empty: "empty",
  drawing: "drawing…",
  pencil: "all pencil",
  partial: "partly inked",
  inked: "fully inked!",
  blocked: "words saved",
  failed: "needs retry"
};

type WritingCoachPhase =
  | "hidden"
  | "available"
  | "invite"
  | "choose"
  | "question"
  | "revising"
  | "compare"
  | "dismissed";

interface WritingCoachState {
  phase: WritingCoachPhase;
  codes: DiagnosticCode[];
  focusCode: DiagnosticCode | null;
  offeredRevisionVersion: number;
  resolvedFocus: boolean;
}

interface AppPanel extends StoryPanelView {
  complaintOpen: boolean;
  complaintDiagnosticCode: DiagnosticCode | null;
  writingCoach: WritingCoachState;
}

type WritingCoachAction =
  | "open"
  | "keep"
  | "not-yet"
  | "later"
  | "choose-other"
  | "start-edit"
  | "closer";

function initialWritingCoach(
  panel: Pick<StoryPanelView, "diagnosticCodes" | "diagnosticCode" | "revisionVersion" | "visualState">
): WritingCoachState {
  const codes = revisionCoachingCodes(
    panel.diagnosticCodes.length > 0
      ? panel.diagnosticCodes
      : panel.diagnosticCode
        ? [panel.diagnosticCode]
        : []
  );
  const shouldInvite =
    panel.visualState === "pencil" ||
    codes.length > 1 ||
    codes.includes("CLUTTER_PRESSURE");
  return {
    phase: codes.length === 0 ? "hidden" : shouldInvite ? "invite" : "available",
    codes,
    focusCode: null,
    offeredRevisionVersion: panel.revisionVersion,
    resolvedFocus: false
  };
}

function appPanel(panel: StoryPanelView): AppPanel {
  return {
    ...panel,
    complaintOpen: false,
    complaintDiagnosticCode: null,
    writingCoach: initialWritingCoach(panel)
  };
}

function reconcileWritingCoach(
  current: WritingCoachState,
  revisionVersion: number,
  visualState: PanelVisualState,
  diagnosticCodes: readonly DiagnosticCode[]
): WritingCoachState {
  if (!["pencil", "partial", "inked"].includes(visualState)) return current;
  const codes = revisionCoachingCodes(diagnosticCodes);
  if (
    current.phase === "revising" &&
    revisionVersion > current.offeredRevisionVersion
  ) {
    return {
      phase: "compare",
      codes,
      focusCode: current.focusCode,
      offeredRevisionVersion: revisionVersion,
      resolvedFocus: Boolean(current.focusCode && !codes.includes(current.focusCode))
    };
  }
  if (current.phase === "dismissed") {
    return {
      ...current,
      codes,
      offeredRevisionVersion: revisionVersion
    };
  }
  if (codes.length === 0) {
    return {
      phase: "hidden",
      codes: [],
      focusCode: null,
      offeredRevisionVersion: revisionVersion,
      resolvedFocus: false
    };
  }
  if (
    current.phase === "hidden" ||
    revisionVersion > current.offeredRevisionVersion
  ) {
    return initialWritingCoach({
      diagnosticCodes: codes,
      diagnosticCode: codes[0] ?? null,
      revisionVersion,
      visualState
    });
  }
  return { ...current, codes };
}

function demoStory(): StoryView {
  const storyId = "00000000-0000-4000-8000-000000000001";
  const panels = Array.from({ length: 6 }, (_, index): StoryPanelView => ({
    panelId: `00000000-0000-4000-8000-${(index + 2).toString().padStart(12, "0")}`,
    ordinal: index + 1,
    storySpineSlot: ["WHO & WHERE", "UH-OH!", "TRY #1", "TRY #2", "THE BIG MOMENT", "THE END"][index] ?? "",
    sourceText: "",
    revisionVersion: 0,
    visualState: "empty",
    diagnosticCode: null,
    diagnosticCodes: [],
    artifactUrl: null
  }));
  const now = new Date().toISOString();
  return {
    story: {
      id: storyId,
      mode: "AUTHOR",
      title: "MY AMAZING COMIC",
      authorDisplayName: "you",
      createdAt: now,
      updatedAt: now,
      styleVersion: "comic-pencil-ink/v1",
      status: "DRAFT"
    },
    panels,
    selectedPanelId: panels[0]?.panelId ?? ""
  };
}

function GuideMascot({ small = false }: { small?: boolean }): ReactNode {
  return (
    <svg
      viewBox="0 0 40 40"
      className={small ? "guide-mascot guide-mascot--small" : "guide-mascot"}
      aria-hidden="true"
    >
      <circle cx="20" cy="22" r="14" fill="currentColor" />
      <circle cx="20" cy="10" r="5" fill="currentColor" />
      <circle cx="15" cy="20" r="4" fill="white" />
      <circle cx="25" cy="20" r="4" fill="white" />
      <circle cx="16" cy="21" r="1.8" fill="currentColor" />
      <circle cx="26" cy="21" r="1.8" fill="currentColor" />
      {!small && (
        <path
          d="M15 28 Q20 32 25 28"
          stroke="white"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function CardIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="3"
        y="5"
        width="12"
        height="16"
        rx="2"
        fill="#fff"
        stroke="currentColor"
        strokeWidth="2"
        transform="rotate(-8 9 13)"
      />
      <rect
        x="9"
        y="3"
        width="12"
        height="16"
        rx="2"
        fill="#ffd23f"
        stroke="currentColor"
        strokeWidth="2"
        transform="rotate(6 15 11)"
      />
    </svg>
  );
}

function MicrophoneIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M6 11 a6 6 0 0 0 12 0" stroke="currentColor" strokeWidth="2.5" fill="none" />
      <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function PencilIcon(): ReactNode {
  return (
    <svg viewBox="0 0 60 60" aria-hidden="true">
      <rect
        x="26"
        y="6"
        width="9"
        height="34"
        rx="2"
        fill="#ffd23f"
        stroke="#1c1c2e"
        strokeWidth="2.5"
        transform="rotate(30 30 30)"
      />
      <polygon
        points="18,46 26,38 30,48 20,52"
        fill="#f0c9a0"
        stroke="#1c1c2e"
        strokeWidth="2.5"
        transform="rotate(30 30 30)"
      />
    </svg>
  );
}

interface DialogProps {
  title: string;
  labelledBy: string;
  className?: string;
  onClose: () => void;
  children: ReactNode;
}

function Dialog({ title, labelledBy, className = "", onClose, children }: DialogProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreFocus.current = document.activeElement as HTMLElement | null;
    const element = dialogRef.current;
    const first = element?.querySelector<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), [tabindex='0']"
    );
    first?.focus();
    return () => restoreFocus.current?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex='0']"
    ) ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <div className="dialog-scrim" role="presentation">
      <div
        ref={dialogRef}
        className={`dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onKeyDown={onKeyDown}
      >
        <span className="sr-only">{title}</span>
        {children}
      </div>
    </div>
  );
}

interface ComicMastheadProps {
  title: string;
  ownedCount: number;
  canFinish: boolean;
  onTitle: (title: string) => void;
  onOpenCards: () => void;
  onFinish: () => void;
}

function ComicMasthead({
  title,
  ownedCount,
  canFinish,
  onTitle,
  onOpenCards,
  onFinish
}: ComicMastheadProps): ReactNode {
  return (
    <header className="masthead">
      <div className="wordmark">{MALIANG_BRAND.productName}</div>
      <label className="sr-only" htmlFor="story-title">Story title</label>
      <input
        id="story-title"
        className="story-title"
        value={title}
        onChange={(event) => onTitle(event.target.value)}
        maxLength={100}
      />
      <div className="masthead__spacer" />
      <button className="comic-button comic-button--cards" onClick={onOpenCards}>
        <span className="button-icon"><CardIcon /></span>
        MY CARDS {ownedCount}/6
      </button>
      <button
        className="comic-button comic-button--finish"
        disabled={!canFinish}
        onClick={onFinish}
      >
        FINISH IT!
      </button>
    </header>
  );
}

interface StoryPanelCardProps {
  panel: AppPanel;
  selected: boolean;
  voiceActive: boolean;
  complaintActive: boolean;
  onSelect: () => void;
  onText: (text: string) => void;
  onComplaint: () => void;
  onVoice: () => void;
  onRetry: () => void;
  onWritingCoach: (action: WritingCoachAction, focusCode?: DiagnosticCode) => void;
}

function WritingCoachPanel({
  panel,
  onAction,
  onFocusEditor
}: {
  panel: AppPanel;
  onAction: (action: WritingCoachAction, focusCode?: DiagnosticCode) => void;
  onFocusEditor: () => void;
}): ReactNode {
  const coach = panel.writingCoach;
  if (coach.phase === "hidden") return null;
  if (
    ["empty", "blocked", "failed"].includes(panel.visualState) ||
    (panel.visualState === "drawing" && coach.phase !== "revising")
  ) return null;
  if (coach.phase === "dismissed") {
    if (coach.codes.length === 0) return null;
    return (
      <button
        className="coach-check-button"
        onClick={(event) => {
          event.stopPropagation();
          onAction("open");
        }}
      >
        CHECK THIS PICTURE
      </button>
    );
  }
  if (coach.phase === "available") {
    return (
      <button
        className="coach-check-button"
        onClick={(event) => {
          event.stopPropagation();
          onAction("open");
        }}
      >
        CHECK THIS PICTURE
      </button>
    );
  }

  const actionButton = (
    label: string,
    action: WritingCoachAction,
    className = "coach-action",
    focusCode?: DiagnosticCode
  ): ReactNode => (
    <button
      key={focusCode ?? label}
      className={className}
      onClick={(event) => {
        event.stopPropagation();
        onAction(action, focusCode);
      }}
    >
      {label}
    </button>
  );

  let content: ReactNode;
  if (coach.phase === "invite") {
    content = (
      <>
        <span className="coach-kicker">PICTURE CHECK</span>
        <p>Some of this is still pencil. Is that how you pictured it?</p>
        <div className="coach-actions">
          {actionButton("YES — KEEP IT", "keep", "coach-action coach-action--quiet")}
          {actionButton("NOT YET", "not-yet", "coach-action coach-action--primary")}
          {actionButton("LATER", "later", "coach-action coach-action--text")}
        </div>
      </>
    );
  } else if (coach.phase === "choose") {
    content = (
      <>
        <span className="coach-kicker">YOU CHOOSE THE FOCUS</span>
        <p>Which part do you want to think about first?</p>
        <div className="coach-focus-list">
          {coach.codes.map((code) => actionButton(
            COACHING_CATALOG[code].focusLabel,
            "not-yet",
            "coach-focus-button",
            code
          ))}
        </div>
        <div className="coach-actions">
          {actionButton("KEEP MY WORDS", "keep", "coach-action coach-action--quiet")}
        </div>
      </>
    );
  } else if (coach.phase === "question") {
    const focusCode = coach.focusCode ?? coach.codes[0] ?? "LOW_CONFIDENCE_COMPLAINT";
    content = (
      <>
        <span className="coach-kicker">ONE QUESTION — YOUR IDEAS</span>
        <p>{COACHING_CATALOG[focusCode].question}</p>
        <p className="coach-promise">Maliang will not add words. Change only what you choose.</p>
        <div className="coach-actions">
          <button
            className="coach-action coach-action--primary"
            onClick={(event) => {
              event.stopPropagation();
              onAction("start-edit");
              onFocusEditor();
            }}
          >
            I KNOW WHAT TO CHANGE
          </button>
          {coach.codes.length > 1 && actionButton(
            "ANOTHER PART",
            "choose-other",
            "coach-action coach-action--quiet"
          )}
          {actionButton("KEEP MY WORDS", "keep", "coach-action coach-action--text")}
        </div>
      </>
    );
  } else if (coach.phase === "revising") {
    content = (
      <>
        <span className="coach-kicker">YOUR TURN</span>
        <p>Change any words you choose above. The next picture will use only your words.</p>
        <div className="coach-actions">
          {actionButton("KEEP MY WORDS", "keep", "coach-action coach-action--text")}
        </div>
      </>
    );
  } else {
    content = (
      <>
        <span className="coach-kicker">LOOK AGAIN</span>
        <p>
          {coach.resolvedFocus
            ? "Your words changed what the picture can show. Is it closer to what you imagined?"
            : "Here is what your new words drew. Is it closer to what you imagined?"}
        </p>
        <div className="coach-actions">
          {actionButton("YES — CLOSER", "closer", "coach-action coach-action--primary")}
          {actionButton("NOT YET", "not-yet", "coach-action coach-action--quiet")}
          {actionButton("I'M KEEPING IT", "keep", "coach-action coach-action--text")}
        </div>
      </>
    );
  }

  return (
    <div
      className="coach-bubble coach-bubble--interactive"
      role="region"
      aria-label="Writing helper"
    >
      <GuideMascot small />
      <div className="coach-bubble__content">{content}</div>
    </div>
  );
}

function StoryPanelCard({
  panel,
  selected,
  voiceActive,
  complaintActive,
  onSelect,
  onText,
  onComplaint,
  onVoice,
  onRetry,
  onWritingCoach
}: StoryPanelCardProps): ReactNode {
  const complaintCoach = panel.complaintOpen
    ? coachingMessage(panel.complaintDiagnosticCode ?? "LOW_CONFIDENCE_COMPLAINT")
    : null;
  return (
    <article
      className={`story-card ${selected ? "story-card--selected" : ""}`}
      data-selected={selected}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
    >
      <header className="story-card__header">
        <span className="panel-number">PANEL {panel.ordinal}</span>
        <span className="spine-label">{panel.storySpineSlot}</span>
        <span className={`status-pill status-pill--${panel.visualState}`}>
          {STATUS_LABEL[panel.visualState]}
        </span>
      </header>
      <label className="sr-only" htmlFor={`panel-text-${panel.panelId}`}>
        Panel {panel.ordinal}: {panel.storySpineSlot}
      </label>
      <textarea
        id={`panel-text-${panel.panelId}`}
        value={panel.sourceText}
        onChange={(event) => onText(event.target.value)}
        onFocus={onSelect}
        onClick={(event) => event.stopPropagation()}
        placeholder={PANEL_PLACEHOLDERS[panel.ordinal - 1]}
        rows={panel.sourceText.length > 90 ? 4 : 3}
        maxLength={4_000}
      />
      {(!panel.sourceText || voiceActive) && selected && (
        <button
          className="voice-button"
          onClick={(event) => {
            event.stopPropagation();
            onVoice();
          }}
        >
          <span className="button-icon"><MicrophoneIcon /></span>
          {voiceActive ? "STOP LISTENING" : "TELL IT OUT LOUD"}
        </button>
      )}
      {panel.sourceText && selected && !panel.complaintOpen && !voiceActive && (
        <div className="complaint-row">
          <button
            className="complaint-button"
            onClick={(event) => {
              event.stopPropagation();
              onComplaint();
            }}
          >
            <span className="button-icon"><MicrophoneIcon /></span>
            {complaintActive ? "Listening… tap to stop" : "Something's wrong? Say it!"}
          </button>
        </div>
      )}
      {panel.visualState === "failed" && selected && (
        <button
          className="retry-button"
          onClick={(event) => {
            event.stopPropagation();
            onRetry();
          }}
        >
          TRY DRAWING AGAIN
        </button>
      )}
      {complaintCoach && selected && (
        <div className="coach-bubble" role="status">
          <GuideMascot small />
          <div>
            <strong>{MALIANG_BRAND.mascotDisplayName}:</strong> {complaintCoach}
          </div>
        </div>
      )}
      {selected && !panel.complaintOpen && (
        <WritingCoachPanel
          panel={panel}
          onAction={onWritingCoach}
          onFocusEditor={() => {
            requestAnimationFrame(() => {
              const editor = document.getElementById(`panel-text-${panel.panelId}`);
              if (editor instanceof HTMLTextAreaElement) {
                editor.focus();
                editor.setSelectionRange(editor.value.length, editor.value.length);
              }
            });
          }}
        />
      )}
    </article>
  );
}

function PencilPlaceholderArt({ ordinal, empty }: { ordinal: number; empty: boolean }): ReactNode {
  if (empty) {
    return (
      <svg className="panel-art" viewBox="0 0 400 300" aria-hidden="true">
        <rect width="400" height="300" fill="#fbfaf4" />
        <text x="200" y="178" textAnchor="middle" className="empty-question">?</text>
      </svg>
    );
  }
  return (
    <svg className="panel-art" viewBox="0 0 400 300" aria-hidden="true">
      <rect width="400" height="300" fill="#fbfaf4" />
      <path className="pencil-stroke" d="M25 248 Q100 228 180 242 T375 238" />
      <ellipse className="pencil-stroke" cx="120" cy="177" rx="52" ry="67" />
      <circle className="pencil-stroke" cx="120" cy="91" r="35" />
      <path className="pencil-stroke" d="M183 220 Q260 152 350 203" />
      <path className="pencil-stroke pencil-stroke--light" d="M220 64 L345 64 M238 88 L330 88" />
      <text x="372" y="282" textAnchor="end" className="pencil-note">
        panel {ordinal} · waiting for words
      </text>
    </svg>
  );
}

function ComicPanel({
  panel,
  selected,
  onSelect
}: {
  panel: AppPanel;
  selected: boolean;
  onSelect: () => void;
}): ReactNode {
  const stateWords = STATUS_LABEL[panel.visualState];
  return (
    <button
      className={`comic-panel ${selected ? "comic-panel--selected" : ""}`}
      onClick={onSelect}
      aria-label={`Panel ${panel.ordinal}, ${stateWords}${selected ? ", selected" : ""}`}
      aria-pressed={selected}
    >
      {panel.artifactUrl ? (
        <img className="panel-art" src={panel.artifactUrl} alt="" />
      ) : (
        <PencilPlaceholderArt ordinal={panel.ordinal} empty={!panel.sourceText} />
      )}
      {panel.visualState === "drawing" && (
        <div className="drawing-overlay" role="status" aria-label="Drawing updated panel">
          <span className="drawing-pencil"><PencilIcon /></span>
          <span className="drawing-label">DRAWING…</span>
        </div>
      )}
      {panel.visualState === "blocked" && (
        <div className="panel-message panel-message--blocked">
          I can't draw that panel. Your words are still saved.
        </div>
      )}
      {panel.visualState === "failed" && (
        <div className="panel-message">The drawing needs another try. Your words are safe.</div>
      )}
      <span className="comic-panel__number">{panel.ordinal}</span>
    </button>
  );
}

function ComicSheet({
  title,
  panels,
  selectedPanelId,
  onSelect
}: {
  title: string;
  panels: AppPanel[];
  selectedPanelId: string;
  onSelect: (panelId: string) => void;
}): ReactNode {
  return (
    <section className="comic-sheet" aria-label="Your comic page">
      <header className="comic-sheet__header">
        <h1>{title || "MY COMIC"}</h1>
        <span>by you!</span>
      </header>
      <div className="comic-grid">
        {panels.map((panel) => (
          <ComicPanel
            key={panel.panelId}
            panel={panel}
            selected={selectedPanelId === panel.panelId}
            onSelect={() => onSelect(panel.panelId)}
          />
        ))}
      </div>
      <div className="pencil-ink-legend">
        <span className="legend-line legend-line--pencil" aria-hidden="true" />
        <span>gray pencil = your words haven't painted it yet</span>
        <span className="legend-line legend-line--ink" aria-hidden="true" />
        <span>ink = you earned it with words!</span>
      </div>
    </section>
  );
}

function CraftCard({
  cardId,
  locked = false
}: {
  cardId: CraftCardId;
  locked?: boolean;
}): ReactNode {
  const card = CRAFT_CARD_CATALOG.find((candidate) => candidate.cardId === cardId);
  if (!card) return null;
  return (
    <article
      className={`craft-card craft-card--${locked ? "locked" : card.cardId}`}
    >
      <header>
        {card.title}
      </header>
      <p>{locked ? "Locked — keep writing to earn this trick!" : card.body}</p>
    </article>
  );
}

function CraftDeckDialog({
  earned,
  onClose
}: {
  earned: ReadonlySet<CraftCardId>;
  onClose: () => void;
}): ReactNode {
  const titleId = useId();
  return (
    <Dialog title="My craft cards" labelledBy={titleId} className="deck-dialog" onClose={onClose}>
      <div className="dialog-heading-row">
        <h2 id={titleId}>MY CRAFT CARDS</h2>
        <p>tricks real authors use — earn them by writing!</p>
        <button className="close-button" onClick={onClose} aria-label="Close craft cards">×</button>
      </div>
      <div className="craft-deck-grid">
        {CRAFT_CARD_CATALOG.map((card) => (
          <CraftCard key={card.cardId} cardId={card.cardId} locked={!earned.has(card.cardId)} />
        ))}
      </div>
    </Dialog>
  );
}

function CardEarnedDialog({
  award,
  onAcknowledge
}: {
  award: CraftCardAward;
  onAcknowledge: () => void;
}): ReactNode {
  const titleId = useId();
  return (
    <Dialog
      title="New card earned"
      labelledBy={titleId}
      className="earned-dialog"
      onClose={onAcknowledge}
    >
      <h2 id={titleId}>NEW CARD EARNED!</h2>
      <CraftCard cardId={award.cardId} />
      <button className="comic-button comic-button--reward" onClick={onAcknowledge}>
        ADD TO MY DECK!
      </button>
    </Dialog>
  );
}

function FinishStoryDialog({
  title,
  panels,
  onPrint,
  onClose
}: {
  title: string;
  panels: AppPanel[];
  onPrint: () => void;
  onClose: () => void;
}): ReactNode {
  const titleId = useId();
  return (
    <Dialog title="You made a comic" labelledBy={titleId} className="finish-dialog" onClose={onClose}>
      <h2 id={titleId}>YOU MADE A COMIC!</h2>
      <section className="print-comic">
        <h3>{title || "MY COMIC"}</h3>
        <p>written &amp; painted with words by YOU</p>
        <div className="print-grid">
          {panels.map((panel) => (
            <div className="print-panel" key={panel.panelId}>
              {panel.artifactUrl ? (
                <img src={panel.artifactUrl} alt={`Panel ${panel.ordinal}`} />
              ) : (
                <PencilPlaceholderArt ordinal={panel.ordinal} empty={!panel.sourceText} />
              )}
            </div>
          ))}
        </div>
      </section>
      <div className="finish-actions">
        <button className="comic-button comic-button--print" onClick={onPrint}>PRINT IT!</button>
        <button className="comic-button comic-button--keep" onClick={onClose}>KEEP WRITING</button>
      </div>
    </Dialog>
  );
}

function ParentGate({
  capability,
  onRetry
}: {
  capability: ChildSafeCapabilityView;
  onRetry: () => void;
}): ReactNode {
  return (
    <main className="parent-gate">
      <div className="wordmark">{MALIANG_BRAND.productName}</div>
      <section>
        <GuideMascot />
        <h1>A grown-up needs to help first.</h1>
        <p>
          {capability.reason === "VERSION_MISMATCH"
            ? `Maliang found Codex ${capability.installedVersion ?? "with an unknown version"}, but needs the reviewed ${capability.requiredVersion} range before drawing can begin.`
            : "Please sign in to Codex with ChatGPT, then come back and try again."}
        </p>
        <button className="comic-button comic-button--reward" onClick={onRetry}>TRY AGAIN</button>
      </section>
    </main>
  );
}

export function MaliangApp(): ReactNode {
  const [storyView, setStoryView] = useState<StoryView | null>(null);
  const [panels, setPanels] = useState<AppPanel[]>([]);
  const [selectedPanelId, setSelectedPanelId] = useState("");
  const [title, setTitle] = useState("");
  const [earnedCards, setEarnedCards] = useState<Set<CraftCardId>>(new Set());
  const [pendingAward, setPendingAward] = useState<CraftCardAward | null>(null);
  const [showDeck, setShowDeck] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [capabilityIssue, setCapabilityIssue] = useState<ChildSafeCapabilityView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [voicePanelId, setVoicePanelId] = useState<string | null>(null);
  const [complaintPanelId, setComplaintPanelId] = useState<string | null>(null);
  const commitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelsRef = useRef<AppPanel[]>([]);

  useEffect(() => {
    panelsRef.current = panels;
  }, [panels]);

  const load = useCallback(async () => {
    const bridge = window.maliang;
    if (!bridge) {
      const demo = demoStory();
      setStoryView(demo);
      setTitle(demo.story.title);
      setPanels(demo.panels.map(appPanel));
      setSelectedPanelId(demo.selectedPanelId);
      return;
    }
    const capability = await bridge.capability();
    if (!capability.ready) {
      setCapabilityIssue(capability);
      return;
    }
    setCapabilityIssue(null);
    const ids = await bridge.listStories();
    const loaded = ids[0]
      ? await bridge.loadStory(ids[0])
      : await bridge.createStory({ mode: "AUTHOR", title: "MY AMAZING COMIC" });
    const deck = await bridge.readDeck();
    setStoryView(loaded);
    setTitle(loaded.story.title);
    setPanels(loaded.panels.map(appPanel));
    setSelectedPanelId(loaded.selectedPanelId);
    setEarnedCards(new Set(deck.earnedCardIds));
    setPendingAward(deck.pendingAwards[0] ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!window.maliang) return;
    return window.maliang.onEvent((event) => {
      if (event.type === "panel.state") {
        setPanels((current) => current.map((panel) => {
          if (panel.panelId !== event.panelId || event.revisionVersion < panel.revisionVersion) {
            return panel;
          }
          const authoritative = ["pencil", "partial", "inked"].includes(event.state);
          const diagnosticCodes = authoritative
            ? revisionCoachingCodes(
                event.diagnosticCodes.length > 0
                  ? event.diagnosticCodes
                  : event.diagnosticCode
                    ? [event.diagnosticCode]
                    : []
              )
            : panel.diagnosticCodes;
          return {
            ...panel,
            revisionVersion: event.revisionVersion,
            visualState: event.state,
            artifactUrl: event.artifactUrl ?? panel.artifactUrl,
            diagnosticCode: authoritative ? event.diagnosticCode : panel.diagnosticCode,
            diagnosticCodes,
            writingCoach: reconcileWritingCoach(
              panel.writingCoach,
              event.revisionVersion,
              event.state,
              diagnosticCodes
            )
          };
        }));
        if (event.errorCode === "PRIVATE_INFORMATION") {
          setNotice("Keep private information out of your comic. Your words are still saved.");
        } else if (event.errorCode) {
          const message =
            event.errorCode === "AUTH_REQUIRED"
              ? "A grown-up needs to sign in to Codex before Maliang can draw."
              : event.errorCode === "USAGE_LIMIT"
                ? "The drawing limit has been reached for now. Your words are safe."
                : event.errorCode === "TIMEOUT"
                  ? "The drawing took too long. Tap TRY DRAWING AGAIN."
                  : event.errorCode === "INVALID_ARTIFACT"
                    ? "The picture did not arrive correctly. Tap TRY DRAWING AGAIN."
                    : event.errorCode === "MODEL_UNAVAILABLE"
                      ? "The drawing model is unavailable. A grown-up needs to update Maliang."
                      : "Maliang could not finish that picture. Tap TRY DRAWING AGAIN.";
          setNotice(message);
        }
      } else {
        if (event.type === "card.earned") {
          setPendingAward((current) => current ?? event.award);
        } else if (event.type === "speech.state") {
          if (event.mode === "draft") {
            setVoicePanelId(event.state === "started" ? event.panelId : null);
          } else {
            setComplaintPanelId(event.state === "started" ? event.panelId : null);
          }
          if (event.state === "error") {
            setNotice(
              event.code === "ON_DEVICE_SPEECH_UNAVAILABLE"
                ? "On-device speech is not available on this Mac. You can always type instead."
                : "Voice input needs a grown-up to check microphone and speech permissions."
            );
          }
        } else if (event.type === "voice.transcript") {
          const currentPanel = panelsRef.current.find(
            (panel) => panel.panelId === event.panelId
          );
          if (!currentPanel) return;
          setPanels((current) => current.map((panel) =>
            panel.panelId === event.panelId
              ? {
                  ...panel,
                  sourceText: event.transcript,
                  visualState: "drawing"
                }
              : panel
          ));
          if (event.isFinal) {
            const timer = commitTimers.current.get(event.panelId);
            if (timer) clearTimeout(timer);
            setVoicePanelId(null);
            void window.maliang?.updatePanelText({
              panelId: event.panelId,
              baseVersion: currentPanel.revisionVersion,
              text: event.transcript,
              origin: "VOICE"
            }).then((revision) => {
              setPanels((current) => current.map((panel) =>
                panel.panelId === event.panelId
                  ? {
                      ...panel,
                      sourceText: revision.sourceText,
                      revisionVersion: revision.version,
                      visualState: revision.state
                    }
                  : panel
              ));
            });
          }
        } else if (event.type === "complaint.diagnostic") {
          setComplaintPanelId(null);
          setPanels((current) => current.map((panel) =>
            panel.panelId === event.panelId && event.revisionVersion === panel.revisionVersion
              ? revisionCoachingCodes([event.diagnosticCode]).length > 0
                ? {
                    ...panel,
                    complaintOpen: false,
                    complaintDiagnosticCode: null,
                    diagnosticCodes: revisionCoachingCodes([
                      event.diagnosticCode,
                      ...panel.diagnosticCodes
                    ]),
                    writingCoach: {
                      phase: "question",
                      codes: revisionCoachingCodes([
                        event.diagnosticCode,
                        ...panel.diagnosticCodes
                      ]),
                      focusCode: event.diagnosticCode,
                      offeredRevisionVersion: event.revisionVersion,
                      resolvedFocus: false
                    }
                  }
                : {
                    ...panel,
                    complaintOpen: true,
                    complaintDiagnosticCode: event.diagnosticCode
                  }
              : panel
          ));
        }
      }
    });
  }, []);

  useEffect(() => () => {
    for (const timer of commitTimers.current.values()) clearTimeout(timer);
    if (titleTimer.current) clearTimeout(titleTimer.current);
  }, []);

  const updateText = (panelId: string, text: string): void => {
    let baseVersion = 0;
    setPanels((current) => current.map((panel) => {
      if (panel.panelId !== panelId) return panel;
      baseVersion = panel.revisionVersion;
      const changed = text !== panel.sourceText;
      let writingCoach = panel.writingCoach;
      if (!text.trim()) {
        writingCoach = {
          phase: "hidden",
          codes: [],
          focusCode: null,
          offeredRevisionVersion: panel.revisionVersion,
          resolvedFocus: false
        };
      } else if (
        changed &&
        ["question", "choose", "revising", "compare"].includes(writingCoach.phase)
      ) {
        writingCoach = { ...writingCoach, phase: "revising" };
      } else if (
        changed &&
        ["invite", "available"].includes(writingCoach.phase)
      ) {
        writingCoach = { ...writingCoach, phase: "dismissed" };
      }
      return {
        ...panel,
        sourceText: text,
        visualState: text.trim() ? "drawing" : "empty",
        complaintOpen: false,
        complaintDiagnosticCode: null,
        writingCoach
      };
    }));
    const previousTimer = commitTimers.current.get(panelId);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = setTimeout(() => {
      const bridge = window.maliang;
      if (!bridge) {
        setPanels((current) => current.map((panel) =>
          panel.panelId === panelId
            ? {
                ...panel,
                sourceText: text,
                revisionVersion: panel.revisionVersion + 1,
                visualState: text.trim() ? "pencil" : "empty"
              }
            : panel
        ));
        return;
      }
      void bridge.updatePanelText({
        panelId,
        baseVersion,
        text,
        origin: "KEYBOARD"
      }).then((revision) => {
        setPanels((current) => current.map((panel) =>
          panel.panelId === panelId
            ? {
                ...panel,
                sourceText: revision.sourceText,
                revisionVersion: revision.version,
                visualState: revision.state
              }
            : panel
        ));
      }).catch((error: unknown) => {
        setNotice(error instanceof Error ? error.message : "That edit could not be saved.");
      });
    }, 1_200);
    commitTimers.current.set(panelId, timer);
  };

  const updateWritingCoach = (
    panelId: string,
    action: WritingCoachAction,
    focusCode?: DiagnosticCode
  ): void => {
    setPanels((current) => current.map((panel) => {
      if (panel.panelId !== panelId) return panel;
      const coach = panel.writingCoach;
      if (action === "keep" || action === "later" || action === "closer") {
        return {
          ...panel,
          writingCoach: { ...coach, phase: "dismissed" }
        };
      }
      if (action === "open") {
        return {
          ...panel,
          writingCoach: {
            ...coach,
            phase: "invite",
            offeredRevisionVersion: panel.revisionVersion
          }
        };
      }
      if (action === "choose-other") {
        return {
          ...panel,
          writingCoach: {
            ...coach,
            phase: "choose",
            focusCode: null,
            offeredRevisionVersion: panel.revisionVersion
          }
        };
      }
      if (action === "start-edit") {
        return {
          ...panel,
          writingCoach: {
            ...coach,
            phase: "revising",
            offeredRevisionVersion: panel.revisionVersion
          }
        };
      }
      const nextFocus = focusCode ?? coach.codes[0] ?? "LOW_CONFIDENCE_COMPLAINT";
      return {
        ...panel,
        writingCoach: {
          ...coach,
          phase: focusCode || coach.codes.length <= 1 ? "question" : "choose",
          focusCode: focusCode || coach.codes.length <= 1 ? nextFocus : null,
          offeredRevisionVersion: panel.revisionVersion,
          resolvedFocus: false
        }
      };
    }));
  };

  const updateTitle = (value: string): void => {
    setTitle(value);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      if (window.maliang && storyView) {
        void window.maliang.updateStoryTitle(storyView.story.id, value);
      }
    }, 450);
  };

  const acknowledgeAward = (): void => {
    if (!pendingAward) return;
    const cardId = pendingAward.cardId;
    setEarnedCards((current) => new Set([...current, cardId]));
    if (window.maliang) {
      void window.maliang.acknowledgeAward(pendingAward.id).then((deck) => {
        setEarnedCards(new Set(deck.earnedCardIds));
        setPendingAward(deck.pendingAwards.find((award) => award.id !== pendingAward.id) ?? null);
      });
    } else {
      setPendingAward(null);
    }
  };

  if (capabilityIssue) {
    return <ParentGate capability={capabilityIssue} onRetry={() => void load()} />;
  }
  if (!storyView) {
    return <div className="loading-screen" role="status">SHARPENING PENCILS…</div>;
  }

  const nonempty = panels.filter((panel) => panel.sourceText.trim()).length;
  const canFinish =
    nonempty >= 5 &&
    panels.every((panel) => !["drawing", "blocked"].includes(panel.visualState));
  const selectedIndex = Math.max(
    0,
    panels.findIndex((panel) => panel.panelId === selectedPanelId)
  );

  return (
    <div className="maliang-shell">
      <ComicMasthead
        title={title}
        ownedCount={earnedCards.size}
        canFinish={canFinish}
        onTitle={updateTitle}
        onOpenCards={() => setShowDeck(true)}
        onFinish={() => setShowFinish(true)}
      />
      <nav className="compact-panel-nav" aria-label="Choose a story panel">
        {panels.map((panel) => (
          <button
            key={panel.panelId}
            aria-current={panel.panelId === selectedPanelId ? "page" : undefined}
            onClick={() => setSelectedPanelId(panel.panelId)}
          >
            {panel.ordinal}
            <span className={`nav-state nav-state--${panel.visualState}`} />
          </button>
        ))}
      </nav>
      <main className="author-workspace">
        <section className="story-column" aria-label="Write your story">
          <div className="guide-introduction">
            <GuideMascot />
            <p>
              Hi, I'm <strong>{MALIANG_BRAND.mascotDisplayName}</strong>! Write your story here —
              I'll draw <em>exactly</em> what your words say.
            </p>
          </div>
          <div className="story-panel-list">
            {panels.map((panel) => (
              <StoryPanelCard
                key={panel.panelId}
                panel={panel}
                selected={panel.panelId === selectedPanelId}
                voiceActive={voicePanelId === panel.panelId}
                complaintActive={complaintPanelId === panel.panelId}
                onSelect={() => setSelectedPanelId(panel.panelId)}
                onText={(text) => updateText(panel.panelId, text)}
                onWritingCoach={(action, focusCode) =>
                  updateWritingCoach(panel.panelId, action, focusCode)
                }
                onRetry={() => {
                  setPanels((current) => current.map((candidate) =>
                    candidate.panelId === panel.panelId
                      ? { ...candidate, visualState: "drawing" }
                      : candidate
                  ));
                  void window.maliang?.retryRender(panel.panelId).catch(() => {
                    setNotice("Maliang could not finish that picture. Tap TRY DRAWING AGAIN.");
                  });
                }}
                onComplaint={() => {
                  if (window.maliang) {
                    if (complaintPanelId === panel.panelId) {
                      void window.maliang.stopComplaint(panel.panelId);
                      setComplaintPanelId(null);
                    } else {
                      void window.maliang.startComplaint(panel.panelId);
                      setComplaintPanelId(panel.panelId);
                    }
                    return;
                  }
                  setPanels((current) => current.map((candidate) =>
                    candidate.panelId === panel.panelId
                      ? {
                          ...candidate,
                          complaintOpen: true,
                          complaintDiagnosticCode: "LOW_CONFIDENCE_COMPLAINT"
                        }
                      : candidate
                  ));
                }}
                onVoice={() => {
                  if (!window.maliang) {
                    setNotice(
                      "Voice drafting uses the on-device macOS speech helper in the packaged app. You can always type here."
                    );
                    return;
                  }
                  if (voicePanelId === panel.panelId) {
                    void window.maliang.stopVoice(panel.panelId);
                    setVoicePanelId(null);
                  } else {
                    void window.maliang.startVoice(panel.panelId);
                    setVoicePanelId(panel.panelId);
                  }
                }}
              />
            ))}
          </div>
        </section>
        <section className="comic-column">
          <ComicSheet
            title={title}
            panels={panels}
            selectedPanelId={selectedPanelId}
            onSelect={setSelectedPanelId}
          />
        </section>
      </main>
      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss message">×</button>
        </div>
      )}
      {pendingAward && (
        <CardEarnedDialog award={pendingAward} onAcknowledge={acknowledgeAward} />
      )}
      {showDeck && (
        <CraftDeckDialog earned={earnedCards} onClose={() => setShowDeck(false)} />
      )}
      {showFinish && (
        <FinishStoryDialog
          title={title}
          panels={panels}
          onPrint={() => {
            if (window.maliang) void window.maliang.exportPdf(storyView.story.id);
            else window.print();
          }}
          onClose={() => setShowFinish(false)}
        />
      )}
      <div className="sr-only" aria-live="polite">
        Selected panel {selectedIndex + 1} of {panels.length}.
      </div>
    </div>
  );
}
