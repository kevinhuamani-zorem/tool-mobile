import { AutomationAgentResponse } from './automationContracts';

type Platform = 'android' | 'ios';

export interface AgentPlatformTagEnforcementResult {
    response: AutomationAgentResponse;
    added: Platform[];
}

function hasPlatformTag(content: string, platform: Platform): boolean {
    return new RegExp(`^\\s*@[^\\n]*@${platform}(?:\\s|$)`, 'mi').test(content);
}

function completeLocatorPlatforms(content: string): Platform[] {
    try {
        const document = JSON.parse(content) as Record<string, unknown>;
        return (['android', 'ios'] as const).filter(platform => {
            const blocks = Object.entries(document)
                .filter(([name, value]) =>
                    name.toLowerCase().endsWith(platform) &&
                    value && typeof value === 'object' && !Array.isArray(value)
                )
                .map(([, value]) => Object.values(value as Record<string, unknown>));
            const values = blocks.flat();
            return values.length > 0 && values.every(value =>
                typeof value === 'string' && Boolean(value.trim())
            );
        });
    } catch {
        return [];
    }
}

function insertFeatureTag(content: string, platform: Platform): string {
    const lines = content.split(/\r?\n/);
    const featureLine = lines.findIndex(line => /^\s*Feature\s*:/i.test(line));
    const tagLine = `@${platform}`;
    if (featureLine < 0) return `${tagLine}\n${content}`;
    lines.splice(featureLine, 0, tagLine);
    return lines.join('\n');
}

export function enforceAgentResponsePlatformTags(
    response: AutomationAgentResponse,
    scenarioPlatform: Platform
): AgentPlatformTagEnforcementResult {
    const feature = response.files.find(file => file.layer === 'feature');
    if (!feature) return { response, added: [] };
    const locators = response.files.find(file => file.layer === 'locators');
    const required = new Set<Platform>([scenarioPlatform]);
    if (locators) {
        completeLocatorPlatforms(locators.content).forEach(platform => required.add(platform));
    }

    let nextContent = feature.content;
    const added: Platform[] = [];
    for (const platform of ['android', 'ios'] as const) {
        if (!required.has(platform) || hasPlatformTag(nextContent, platform)) continue;
        nextContent = insertFeatureTag(nextContent, platform);
        added.push(platform);
    }
    if (!added.length) return { response, added };

    return {
        response: {
            ...response,
            files: response.files.map(file =>
                file.layer === 'feature'
                    ? { ...file, content: nextContent }
                    : file
            ),
        },
        added,
    };
}
