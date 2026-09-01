export interface ReusedLocator {
    name: string;
    import: string;
    identifier: string;
    reference: Partial<Record<'android' | 'ios', string>>;
    type: Partial<Record<'android' | 'ios', string>>;
}

export interface GeneratedPreview {
    featurePath: string;
    locatorPath?: string;
    featureContent: string;
    locatorContent?: string;
    stepPath?: string;
    stepContent?: string;
    screenPath?: string;
    screenContent?: string;
    files: string[];
}
