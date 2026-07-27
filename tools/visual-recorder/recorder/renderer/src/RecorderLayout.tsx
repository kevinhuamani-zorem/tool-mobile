import { ConfigurationScreen } from './components/ConfigurationScreen';
import { RecorderScreen } from './components/RecorderScreen';

export function RecorderLayout() {
    return (
        <div className="recorder-root">
            <ConfigurationScreen />
            <RecorderScreen />
        </div>
    );
}
