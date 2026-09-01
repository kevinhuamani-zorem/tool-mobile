import { RecorderMode, projectPaths, validateFrameworkRoot } from './projectPaths';


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
        output: 'fwk-mobile';
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

export function getWorkspaceAdapter(): WorkspaceAdapter {
    return new FwkMobileAdapter();
}
