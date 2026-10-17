import { DRILLS } from "../../engine/DrillLibrary";
import type { DrillId } from "../../engine/Types";
import { selectStyle } from "../PracticeScreen.styles";

type DrillPickerPanelProps = {
    selectedDrillId: DrillId;
    onSelectDrill: (drillId: DrillId) => void;
    disabled?: boolean;
};

/** Pick any single drill to run outside the daily plan. */
export default function DrillPickerPanel({
    selectedDrillId,
    onSelectDrill,
    disabled = false,
}: DrillPickerPanelProps) {
    const selectedDrill = DRILLS[selectedDrillId];

    return (
        <>
            <select
                aria-label="Drill"
                value={selectedDrillId}
                disabled={disabled}
                onChange={(e) => onSelectDrill(e.target.value as DrillId)}
                style={selectStyle}
            >
                {Object.values(DRILLS).map((drill) => (
                    <option key={drill.id} value={drill.id}>
                        {drill.title}
                    </option>
                ))}
            </select>

            <div style={{ fontSize: 12, opacity: 0.78, marginTop: 6, lineHeight: 1.4 }}>
                {selectedDrill.description}
            </div>
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                {selectedDrill.durationSec}s, difficulty {selectedDrill.difficulty}/10
                {selectedDrill.unlockScore ? `, unlocks in plans at ${selectedDrill.unlockScore}` : ""}
            </div>
        </>
    );
}
