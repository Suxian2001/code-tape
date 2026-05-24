import { describe, expect, it } from "vitest";
import { createReplayScheduler } from "../replayScheduler";
import { createTimelineClock } from "../timelineClock";
import { buildInitialState } from "../initialState";
import { replayReducer } from "../replayReducer";
import type {
  RecordingEvent,
  RecordingPackageV1,
  RecordingSnapshot,
  ReplayStableState,
} from "@/shared/recording-schema";
import { RECORDING_SCHEMA_VERSION } from "@/shared/recording-schema";

function content(seq: number, t: number, code: string): RecordingEvent {
  return {
    id: `e-${seq}`,
    seq,
    timestampMs: t,
    source: "editor",
    track: "main",
    type: "content-change",
    payload: {
      fileId: "main",
      version: seq,
      code,
      contentHash: code,
      language: "typescript",
      changeReason: "input",
      changeCount: 1,
      flushedBy: "debounce",
    },
  };
}

function shortcut(seq: number, t: number): RecordingEvent {
  return {
    id: `s-${seq}`,
    seq,
    timestampMs: t,
    source: "shortcut",
    track: "ui",
    type: "shortcut",
    payload: { keys: ["Cmd", "S"], label: "Save" },
  };
}

function makePkg(events: RecordingEvent[], snapshots: RecordingSnapshot[] = [], durationMs = 10_000): RecordingPackageV1 {
  return {
    schemaVersion: RECORDING_SCHEMA_VERSION,
    manifest: {
      packageId: "p",
      schemaVersion: RECORDING_SCHEMA_VERSION,
      status: "complete",
      createdAt: "2026-05-24T00:00:00.000Z",
      completedAt: null,
      checksums: { eventsSha256: "", snapshotsSha256: "" },
    },
    meta: {
      id: "rec",
      title: "t",
      createdAt: "2026-05-24T00:00:00.000Z",
      durationMs,
      appVersion: "0",
      ownerId: null,
      creatorInfo: null,
      initialLanguage: "javascript",
      initialFontSize: 14,
      initialTheme: "dark",
      mediaCapability: {
        audio: "available",
        camera: "available",
        selectedAudioDeviceId: null,
        selectedCameraDeviceId: null,
      },
    },
    events,
    snapshots,
    media: null,
  };
}

function replayFromZeroTo(pkg: RecordingPackageV1, targetMs: number): ReplayStableState {
  let state = buildInitialState(pkg);
  for (const event of pkg.events) {
    if (event.timestampMs > targetMs) break;
    state = replayReducer(state, event);
  }
  return state;
}

describe("createReplayScheduler", () => {
  it("INVARIANT: replay-from-zero produces the same stable state as seek(t)", async () => {
    const events: RecordingEvent[] = [];
    let code = "";
    for (let seq = 1; seq <= 60; seq += 1) {
      code += `line ${seq}\n`;
      events.push(content(seq, seq * 100, code));
      if (seq % 5 === 0) events.push(shortcut(events.length + 100, seq * 100 + 10));
    }
    events.sort((a, b) => a.seq - b.seq);
    events.forEach((e, idx) => {
      e.seq = idx + 1;
    });

    const pkg = makePkg(events, [], 10_000);
    const clock = createTimelineClock({ nowProvider: () => 0 });
    const scheduler = createReplayScheduler({
      clock,
      tickStrategy: { start: () => {}, stop: () => {} },
    });
    await scheduler.load(pkg);

    for (const target of [0, 500, 1500, 3300, 5000, 8888, 10_000]) {
      await scheduler.seek(target);
      const fromSeek = scheduler.getStableState();
      const fromZero = replayFromZeroTo(pkg, target);
      expect(fromSeek.editor.code).toBe(fromZero.editor.code);
      expect(fromSeek.editor.language).toBe(fromZero.editor.language);
    }
  });

  it("INVARIANT: seek lands on the inclusive snapshot when present, then applies later events", async () => {
    const events: RecordingEvent[] = [
      content(1, 100, "a"),
      content(2, 200, "ab"),
      content(3, 400, "abc"),
      content(4, 600, "abcd"),
    ];
    const snapshotState: ReplayStableState = {
      ...buildInitialState(makePkg([])),
      editor: {
        code: "ab",
        language: "typescript",
        cursor: null,
        selection: null,
        scrollTop: 0,
        scrollLeft: 0,
        fontSize: 14,
        theme: "dark",
      },
    };
    const snapshot: RecordingSnapshot = {
      id: "snap-1",
      timestampMs: 200,
      eventSeq: 2,
      state: snapshotState,
    };
    const pkg = makePkg(events, [snapshot], 1000);
    const scheduler = createReplayScheduler({
      tickStrategy: { start: () => {}, stop: () => {} },
    });
    await scheduler.load(pkg);

    await scheduler.seek(500);
    const at500 = scheduler.getStableState();
    expect(at500.editor.code).toBe("abc");

    await scheduler.seek(700);
    const at700 = scheduler.getStableState();
    expect(at700.editor.code).toBe("abcd");
  });

  it("status transitions ready → playing → paused → ended", async () => {
    let wall = 0;
    const clock = createTimelineClock({ nowProvider: () => wall });
    const pkg = makePkg([content(1, 100, "a")], [], 500);
    const scheduler = createReplayScheduler({
      clock,
      tickStrategy: { start: () => {}, stop: () => {} },
    });
    const seen: string[] = [];
    scheduler.subscribe((s) => seen.push(s.status));
    await scheduler.load(pkg);
    scheduler.play();
    wall = 200;
    scheduler.tick();
    scheduler.pause();
    expect(seen).toContain("ready");
    expect(seen).toContain("playing");
    expect(seen).toContain("paused");

    scheduler.play();
    wall += 600; // advance wall enough to push timeline past duration
    scheduler.tick();
    expect(scheduler.getStableState().editor.code).toBe("a");
    expect(seen).toContain("ended");
  });
});
