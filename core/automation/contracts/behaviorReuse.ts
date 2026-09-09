export interface BehaviorReuseReport {
    schemaVersion: 1;
    catalogRevision?: string;
    metrics: { functionalRows: number; reusedSteps: number; reusedMethods: number; newImplementations: number; coveredActions: number };
    decisions: Array<{ text: string; kind: 'step' | 'method' | 'create'; method?: string; file?: string; sequences: number[]; reason: string }>;
    sameCase: Array<{ file: string; name: string; steps: number }>;
    observations: string[];
}
