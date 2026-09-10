function QaIcon({ kind }: { kind: 'recover' | 'golden' | 'refresh' }) {
    return <span className="qa-workspace-icon" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'recover' ? <><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3M8 3v5h5M8 3l5 5" /><path d="M21 5v7H10m0 0 3-3m-3 3 3 3" /></> : kind === 'golden' ? <><path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4V4Z" /><path d="m9 10 2 2 4-4" /></> : <><path d="M20 8a8 8 0 0 0-14-2L3 9m0-6v6h6M4 16a8 8 0 0 0 14 2l3-3m0 6v-6h-6" /></>}
    </svg></span>;
}

export function QaGoldenWorkspace() {
    return <section className="qa-workspace" aria-labelledby="qaWorkspaceTitle">
        <div className="qa-workspace-heading"><div><span className="eyebrow">CALIDAD COMPARTIDA</span><h2 id="qaWorkspaceTitle">De una revisión QA a un ejemplo para el equipo</h2>
            <p>Un golden guarda una versión que revisaste. Los agentes la consultan como referencia al generar casos compatibles.</p></div>
            <span className="qa-workspace-hint">Sin conectar un dispositivo</span></div>
        <div className="qa-workspace-actions">
            <article className="qa-workspace-action"><QaIcon kind="recover" /><h3>Recuperar correcciones</h3>
                <p id="qaRecoveryHelp">Trae al Recorder los cambios que hiciste en el framework. Compáralos, guarda la revisión y apruébala como golden.</p>
                <button type="button" id="btnRecoverFramework" className="btn btn-navy" aria-describedby="qaRecoveryHelp">Revisar cambios del framework →</button>
                <small>Puedes repetirlo después de nuevos cambios en el PR.</small>
            </article>
            <article className="qa-workspace-action"><QaIcon kind="golden" /><h3>Biblioteca golden</h3>
                <p id="qaLibraryHelp">Consulta los casos aprobados del repositorio, quién los revisó y cuáles se usan como referencias para los agentes.</p>
                <button type="button" id="btnGoldenCases" className="btn btn-dark" aria-describedby="qaLibraryHelp">Ver casos golden</button>
                <small>Compartidos por Git en <code>tests/golden</code>.</small>
            </article>
            <article className="qa-workspace-action"><QaIcon kind="refresh" /><h3>Actualizar referencias</h3>
                <p id="qaRefreshHelp">Después de actualizar tu rama, incorpora los golden aprobados a la lista local de referencias de los agentes.</p>
                <button type="button" id="btnSeedGoldenReferences" className="btn btn-dark" aria-describedby="qaRefreshHelp" title="Reconstruye los índices locales de golden aprobados; equivale a golden:seed-memory.">Actualizar referencias</button>
                <small>Usa el repositorio local. No descarga cambios de Git.</small>
            </article>
        </div>
        <section className="qa-golden-guide" aria-labelledby="qaGoldenGuideTitle">
            <h3 id="qaGoldenGuideTitle">Cómo guardar un caso golden</h3>
            <ol>
                <li><span aria-hidden="true">1</span><div><strong>Prepara la versión</strong><p>Genera y revisa el caso en el Recorder. Si lo corregiste en el framework, recupera primero esos cambios.</p></div></li>
                <li><span aria-hidden="true">2</span><div><strong>Revisa y aprueba</strong><p>Abre «Revisar y guardar golden», revisa los archivos y declara el resultado de ejecución. Marca tu aprobación para guardar.</p></div></li>
                <li><span aria-hidden="true">3</span><div><strong>Comparte con el equipo</strong><p>Incluye los cambios de <code>tests/golden</code> en un commit y PR del Recorder. Los demás QA los reciben al actualizar su rama.</p></div></li>
            </ol>
            <details className="qa-golden-help"><summary>Qué significa aprobar o actualizar una referencia</summary>
                <p>La aprobación corresponde a los archivos que revisaste. Si aún no ejecutaste la prueba en dispositivo, deja «Todavía no ejecutado»; el diagnóstico técnico no demuestra el resultado funcional.</p>
                <p>Actualizar referencias equivale a <code>npm run golden:seed-memory</code>: comprueba y reconstruye los índices de las versiones aprobadas. Los casos reservados para evaluación se mantienen fuera de los ejemplos para agentes.</p>
            </details>
        </section>
    </section>;
}
