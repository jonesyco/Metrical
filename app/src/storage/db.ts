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

// Skills
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