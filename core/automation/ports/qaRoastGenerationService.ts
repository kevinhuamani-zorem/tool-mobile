import { QaRoastGenerationResult, TestDesignReview } from '../contracts';

/** Puerto de presentación opcional; el diagnóstico funcional no depende de él. */
export interface QaRoastGenerationService {
    generate(packageDirectory: string, review: TestDesignReview): Promise<QaRoastGenerationResult>;
}
