import { ConfigurationScreen } from './components/ConfigurationScreen';
import { RecorderScreen } from './components/RecorderScreen';
import { FrameworkRecoveryModal } from './components/FrameworkRecoveryModal';

export function RecorderLayout() {
    return (
        <div className="recorder-root">
            <ConfigurationScreen />
            <RecorderScreen />
            <FrameworkRecoveryModal />
        </div>
    );
}
