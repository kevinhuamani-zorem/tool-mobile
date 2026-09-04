/**
 * Prompt de la PASS 2 (semántica) del pipeline determinista: el agente solo
 * escribe gap-resolutions.json y testDesignReview; nunca código.
 */
export function semanticPassPrompt(context: Record<string, unknown>): string {
    const promptBase = 'PASS 2 (SEMANTIC): genera gap-resolutions.json para cerrar gaps semánticos y redactar únicamente filas Gherkin template.';
    const instructions = [
        'No generes código ni archivos feature/steps/screen/locators.',
        'Puedes ejecutar node, python o python3 solo para validar archivos autorizados de este paquete. Usa herramientas nativas para leer/escribir. No explores el framework ni modifiques archivos inmutables con scripts.',
        'No cambies recordingId ni planId.',
        'Escribe solo gap-resolutions.json con schemaVersion "1.0".',
        'Cada resolución debe incluir gapId, decision y reason cuando aplique.',
        'Si scenario.scenarioRows contiene wording "template", agrega gherkinResolutions. Cada elemento lleva keyword, text declarativo, actionSequences y reason.',
        'Cubre exactamente una vez todas las secuencias de filas template. Puedes consolidar filas template contiguas en un solo step incluyendo todas sus actionSequences.',
        'No reescribas filas domain, qa o reused. No inventes resultados no observados, no menciones clicks, botones, campos, scrolls ni selectores.',
        'Incluye siempre testDesignReview con status, summary e issues. Evalúa diseño funcional, no sintaxis: contrasta objective y acceptanceCriteria con las acciones y verificaciones observadas.',
        'Usa status "suggestion" si observas oportunidades de mejorar el diseño. Son recomendaciones no bloqueantes: no exijas una aserción tras cada interacción, acepta una validación consolidada al final y no inventes requisitos fuera de acceptanceCriteria.',
        'No incluyas roast ni contenido humorístico: esta pasada produce únicamente el diagnóstico funcional. La presentación opcional se genera después en una sesión aislada.',
        'Usa status "pass" cuando no tengas recomendaciones útiles. No decidas si se permite generar: el recorder solo bloquea por errores técnicos.',
        'Los issue.code permitidos son missing-business-assertion, control-existence-only, acceptance-criteria-mismatch, missing-test-oracle, dependent-variants y ambiguous-objective. actionSequences solo puede referenciar acciones reales. Da al QA una recomendación concreta para volver a grabar.',
        'Decisiones canónicas permitidas: "reuse", "replace-existing", "create", "resolved", "qa-required" o "unresolved".',
        'Para gap-extend-existing-artifacts usa "resolved": las rutas update ya están fijadas por generation-plan.json.',
        'Si decision es "reuse", incluye selectedCandidate:{file,module,name} copiando exactamente un candidato del plan o de query-results.json; no uses aliases.',
        'Si el QA autoriza conservar una clave pero reemplazar su selector, usa "replace-existing" con selectedCandidate y replacement:{platform,sequence}; TypeLocator/selector salen del recording.',
        'En modo determinista nunca edites agent-response.json: el recorder lo regenera desde gap-resolutions.json.',
        'Después de escribir gap-resolutions.json, lee validation-feedback.json: el recorder materializa y valida la propuesta con el contrato oficial.',
        'Si validation-feedback.json sigue en "awaiting-output", espera brevemente y vuelve a leerlo. Si tiene status "correction-required", corrige solo gap-resolutions.json y vuelve a leer el feedback. Los estados "valid" y "planner-regeneration-required" son terminales; el último indica que el recorder debe reconstruir el plan y no admite otra corrección semántica.',
        'selectedCandidate siempre identifica un locator autorizado; no coloques ahí métodos de Screen Object.',
        'Si falta contexto para cerrar un gap, usa decision "unresolved" y opcionalmente needs:[{query,args}].',
    ].join(' ');
    return `${promptBase}\n${instructions}\nBEGIN_AGENT_CONTEXT_JSON\n${JSON.stringify(context)}\nEND_AGENT_CONTEXT_JSON\n`;
}
