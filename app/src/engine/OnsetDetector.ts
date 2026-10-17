export type Onset = {
    timeSec: number;    // AudioContext time of the attack
    strengthDb: number; // level above the running noise floor
};

export type OnsetDetectorOptions = {
    /** Minimum jump (dB) above the recent minimum to count as an attack. */
    riseDb: number;
    /** Window (sec) for the "recent minimum" the rise is measured against. */
    lookbackSec: number;
    /** The frame must also sit this far (dB) above the noise floor. */
    minAboveFloorDb: number;
    /** No new onset within this many seconds of the previous one. */
    refractorySec: number;
    /** How fast (dB/sec) the noise floor creeps up while signal is present. */
    floorRiseDbPerSec: number;
    /** Time constant (sec) for the floor following quieter frames down. */
    floorFallTauSec: number;
    /** Energy frames averaged before measuring, to calm frame-to-frame noise flicker. */
    smoothingFrames: number;
};

const DEFAULTS: OnsetDetectorOptions = {
    riseDb: 7,
    lookbackSec: 0.04,
    minAboveFloorDb: 12,
    refractorySec: 0.07,
    floorRiseDbPerSec: 3,
    floorFallTauSec: 0.25,
    smoothingFrames: 3,
};

/**
 * Energy-envelope onset detector. Feed it short-time energy frames (mean
 * square per hop) in time order; it returns an Onset for frames where a
 * syllable attack begins. Pure and clock-agnostic so it can be unit tested.
 */
export class OnsetDetector {
    private readonly opts: OnsetDetectorOptions;
    private floorDb: number | null = null;
    private lastFrameTime: number | null = null;
    private lastOnsetTime = -Infinity;
    private history: { t: number; db: number }[] = [];
    private recentEnergy: number[] = [];

    constructor(options: Partial<OnsetDetectorOptions> = {}) {
        this.opts = { ...DEFAULTS, ...options };
    }

    push(timeSec: number, energy: number): Onset | null {
        this.recentEnergy.push(energy);
        if (this.recentEnergy.length > this.opts.smoothingFrames) this.recentEnergy.shift();
        const smoothed = this.recentEnergy.reduce((a, b) => a + b, 0) / this.recentEnergy.length;
        const db = 10 * Math.log10(smoothed + 1e-12);

        const dt = this.lastFrameTime == null ? 0 : Math.max(0, timeSec - this.lastFrameTime);
        this.lastFrameTime = timeSec;

        // The floor tracks the typical noise level, not its single quietest
        // frame: it eases down toward quieter frames and creeps up otherwise.
        if (this.floorDb == null) {
            this.floorDb = db;
        } else if (db < this.floorDb) {
            this.floorDb += (db - this.floorDb) * Math.min(1, dt / this.opts.floorFallTauSec);
        } else {
            this.floorDb += this.opts.floorRiseDbPerSec * dt;
        }

        const cutoff = timeSec - this.opts.lookbackSec;
        while (this.history.length && this.history[0].t < cutoff) this.history.shift();
        const recentMin = this.history.length
            ? Math.min(...this.history.map((h) => h.db))
            : db;
        this.history.push({ t: timeSec, db });

        const isAttack =
            db - recentMin >= this.opts.riseDb &&
            db - this.floorDb >= this.opts.minAboveFloorDb &&
            timeSec - this.lastOnsetTime >= this.opts.refractorySec;

        if (!isAttack) return null;

        this.lastOnsetTime = timeSec;
        return { timeSec, strengthDb: db - this.floorDb };
    }
}
