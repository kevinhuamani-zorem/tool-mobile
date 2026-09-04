/**
 * Puerto de `automation/application`: lo que el resolver determinista puede
 * recordar de automatizaciones validadas en OTROS recordings (ver
 * `domain/memoryFragments`). La implementacion real vive en
 * `AutomationMemory`; los tests pasan un objeto en memoria.
 */
import { GapFragment, InteractionRecall } from '../domain/memoryFragments';
import { UnresolvedGap } from '../contracts';

export interface MemoryFragmentsPort {
    recallInteractions(squad: string, identities: string[], usedTexts?: Set<string>): InteractionRecall[] | undefined;
    recallGap(squad: string, type: UnresolvedGap['type'], identity: string): GapFragment | undefined;
}
