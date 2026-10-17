import { openDB } from "idb";
import type { ReviewItem, SkillSnapshot } from "../engine/Types";

export type StoredAttempt = {
    id: string;
    createdAt: number;
    bpm: number;
    drillId: string;
    durationMs: number;
    audioBlob: Blob;
    transcript?: string;
    words?: { word: string; start: number; end: number }[];
    metrics?: Record<string, unknown>;
    /** Latency-corrected syllable onsets, seconds from beat 1 of bar 1. */
    onsets?: { timeSec: number; strengthDb: number }[];
    latencyMs?: number | null;
};


export const dbPromise = openDB("freestyle-trainer", 2, {
    upgrade(db, oldVersion) {
        if (oldVersion < 1) {
            db.createObjectStore("attempts", { keyPath: "id" });
        }
        if (oldVersion < 2) {
            db.createObjectStore("skills", { keyPath: "at" });
            db.createObjectStore("reviews"); // single key store
        }
    },
});

export async function saveAttempt(attempt: StoredAttempt) {
    const db = await dbPromise;
    await db.put("attempts", attempt);
}

export async function listAttempts(): Promise<StoredAttempt[]> {
    const db = await dbPromise;
    return (await db.getAll("attempts")).sort((a, b) => b.createdAt - a.createdAt);
}

export type AttemptSummary = {
    id: string;
    createdAt: number;
    drillId: string;
    bpm: number;
    score: number | null;
};

/** Recent attempts without their audio, newest first. */
export async function listAttemptSummaries(limit = 20): Promise<AttemptSummary[]> {
    const db = await dbPromise;
    const out: AttemptSummary[] = [];
    let cursor = await db.transaction("attempts").store.openCursor();
    while (cursor) {
        const a = cursor.value as StoredAttempt;
        const score = a.metrics?.score;
        out.push({
            id: a.id,
            createdAt: a.createdAt,
            drillId: a.drillId,
            bpm: a.bpm,
            score: typeof score === "number" ? score : null,
        });
        cursor = await cursor.continue();
    }
    return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

// Skills
export async function listSkillHistory(): Promise<SkillSnapshot[]> {
    const db = await dbPromise;
    return (await db.getAll("skills")).sort((a, b) => a.at - b.at);
}

export async function getLatestSkills(): Promise<SkillSnapshot | undefined> {
    const db = await dbPromise;
    const all = await db.getAll("skills");
    return all.sort((a, b) => b.at - a.at)[0];
}

export async function saveSkills(snapshot: SkillSnapshot) {
    const db = await dbPromise;
    await db.put("skills", snapshot);
}

// Reviews
const REVIEWS_KEY = "reviewSchedule";

export async function getReviewSchedule(): Promise<ReviewItem[]> {
    const db = await dbPromise;
    return (await db.get("reviews", REVIEWS_KEY)) ?? [];
}

export async function saveReviewSchedule(items: ReviewItem[]) {
    const db = await dbPromise;
    await db.put("reviews", items, REVIEWS_KEY);
}