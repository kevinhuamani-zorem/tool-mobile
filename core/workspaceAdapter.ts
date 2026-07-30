import { RecorderMode, ensureWorkspace, projectPaths, validateFrameworkRoot } from './projectPaths';

export interface WorkspaceAdapter {
    id: RecorderMode;
    label: string;
    integrated: boolean;
    supportsCodeGraph: boolean;
    supportsLayerGeneration: boolean;
    initialize(): void;
    describe(): {
        mode: RecorderMode;
        label: string;
        root: string;
        integrated: boolean;
        output: 'fwk-mobile' | 'standalone' | 'neutral';
    };
}

abstract class BaseAdapter implements WorkspaceAdapter {
    abstract id: RecorderMode;
    abstract label: string;
    abstract integrated: boolean;
    abstract supportsCodeGraph: boolean;
    abstract supportsLayerGeneration: boolean;
    abstract initialize(): void;

    describe() {
        return {
            mode: this.id,
            label: this.label,
            root: projectPaths.frameworkRoot,
            integrated: this.integrated,
            output: this.id
        };
    }
}

class FwkMobileAdapter extends BaseAdapter {
    id = 'fwk-mobile' as const;
    label = 'fwk-mobile';
    integrated = true;
    supportsCodeGraph = true;
    supportsLayerGeneration = true;
    initialize(): void { validateFrameworkRoot(); }
}

class StandaloneAdapter extends BaseAdapter {
    id = 'standalone' as const;
    label = 'Standalone WebdriverIO';
    integrated = false;
    supportsCodeGraph = true;
    supportsLayerGeneration = true;
    initialize(): void { ensureWorkspace(); }
}

class NeutralAdapter extends BaseAdapter {
    id = 'neutral' as const;
    label = 'Grabación neutral';
    integrated = false;
    supportsCodeGraph = false;
    supportsLayerGeneration = false;
    initialize(): void { ensureWorkspace(); }
}

export function getWorkspaceAdapter(mode: RecorderMode = projectPaths.mode): WorkspaceAdapter {
    if (mode === 'standalone') return new StandaloneAdapter();
    if (mode === 'neutral') return new NeutralAdapter();
    return new FwkMobileAdapter();
}
