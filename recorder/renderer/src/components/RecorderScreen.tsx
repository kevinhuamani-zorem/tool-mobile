import { HierarchyModal } from './HierarchyModal';
import { RecorderWorkspace } from './RecorderWorkspace';
import { ScenarioBuilderModal } from './ScenarioBuilderModal';
import { SessionOnboarding } from './SessionOnboarding';
import { SessionStatusBar } from './SessionStatusBar';

export function RecorderScreen() {
    return (
        <div id="screenRecorder" className="screen" style={{ display: 'none' }}>
            <RecorderWorkspace />
            <HierarchyModal />
            <SessionStatusBar />
            <SessionOnboarding />
            <ScenarioBuilderModal />
        </div>
    );
}
