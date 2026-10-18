import type { DrillId, PlannedSession } from "../../engine/Types";
import { panelStyle, segmentGroupStyle, segmentStyle } from "../PracticeScreen.styles";
import DrillPickerPanel from "./DrillPickerPanel";
import SessionPathPanel from "./SessionPathPanel";

type DrillsPanelProps = {
    plan: PlannedSession | null;
    stepIndex: number;
    done: boolean;
    selectedDrillId: DrillId;
    onSelectDrill: (drillId: DrillId) => void;
    useManualDrill: boolean;
    onToggleManual: (value: boolean) => void;
    isRunning: boolean;
};

/** Daily plan or a single hand-picked drill: the two ways to choose what runs next. */
export default function DrillsPanel({
    plan,
    stepIndex,
    done,
    selectedDrillId,
    onSelectDrill,
    useManualDrill,
    onToggleManual,
    isRunning,
}: DrillsPanelProps) {
    return (
        <section style={panelStyle}>
            <div style={{ ...segmentGroupStyle, marginBottom: 10 }} role="group" aria-label="Drill source">
                <button
                    onClick={() => onToggleManual(false)}
                    aria-pressed={!useManualDrill}
                    disabled={isRunning}
                    style={segmentStyle(!useManualDrill, isRunning)}
                >
                    Today’s plan
                </button>
                <button
                    onClick={() => onToggleManual(true)}
                    aria-pressed={useManualDrill}
                    disabled={isRunning}
                    style={segmentStyle(useManualDrill, isRunning)}
                >
                    Single drill
                </button>
            </div>

            {useManualDrill ? (
                <DrillPickerPanel
                    selectedDrillId={selectedDrillId}
                    onSelectDrill={onSelectDrill}
                    disabled={isRunning}
                />
            ) : (
                <SessionPathPanel plan={plan} stepIndex={stepIndex} done={done} />
            )}
        </section>
    );
}
