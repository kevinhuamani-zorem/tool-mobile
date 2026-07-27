import { useEffect, useState } from 'react';
import { RecorderLayout } from './RecorderLayout';
import { initializeRecorder } from './controller/recorderController.js';
import './styles/recorder.css';

export function App() {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let active = true;
        void initializeRecorder().then(() => {
            if (!active) return;
            setReady(true);
        });
        return () => {
            active = false;
        };
    }, []);

    return (
        <div className={ready ? 'react-recorder ready' : 'react-recorder loading'}>
            <RecorderLayout />
        </div>
    );
}
