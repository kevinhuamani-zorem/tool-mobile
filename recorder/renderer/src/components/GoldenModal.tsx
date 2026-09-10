export function GoldenModal() {
    return <div id="goldenModal" className="golden-overlay" style={{ display: 'none' }} role="dialog" aria-modal="true" aria-labelledby="goldenTitle" aria-describedby="goldenSubtitle">
        <section className="golden-card">
            <header className="golden-header">
                <div><span className="eyebrow">REFERENCIAS DEL EQUIPO</span><h2 id="goldenTitle">Casos golden</h2>
                    <p id="goldenSubtitle">Casos revisados por QA que sirven de ejemplo a los agentes.</p></div>
                <button id="btnCloseGolden" type="button" className="btn btn-dark" aria-label="Cerrar casos golden">✕ Cerrar</button>
            </header>
            <div className="golden-body">
                <p id="goldenStatus" className="golden-status" role="status" aria-live="polite" />
                <button id="btnRetryGolden" type="button" className="btn btn-dark" style={{ display: 'none' }}>Volver a intentar</button>
                <section id="goldenLibrary">
                    <section className="golden-refresh-panel" aria-label="Actualizar referencias de los agentes">
                        <div><strong>Referencias del repositorio local</strong><p id="goldenRefreshHelp">Después de actualizar tu rama, usa este botón para incorporar los golden aprobados. Equivale a <code>golden:seed-memory</code>; no descarga cambios de Git.</p></div>
                        <button id="btnRebuildGolden" type="button" className="btn btn-navy" aria-describedby="goldenRefreshHelp">↻ Actualizar referencias</button>
                    </section>
                    <div className="golden-section-heading"><div><h3>Biblioteca compartida <span id="goldenCount" className="golden-count">0</span></h3>
                        <p id="goldenLibrarySummary">Disponibles en este repositorio</p></div></div>
                    <div className="golden-filters">
                        <label className="golden-search"><span className="golden-sr-only">Buscar casos golden</span><input id="goldenSearch" className="field-input" type="search" placeholder="Buscar por caso, squad o QA…" /></label>
                        <label><span className="golden-sr-only">Filtrar por uso</span><select id="goldenFilter" className="field-select"><option value="all">Todos los usos</option><option value="reference">Referencias para agentes</option><option value="evaluation">Reservados para evaluación</option></select></label>
                    </div>
                    <div id="goldenList" className="golden-case-list" />
                    <div id="goldenLegacy" />
                    <div id="goldenIssues" />
                </section>
                <div id="goldenReview" style={{ display: 'none' }}>
                    <section className="golden-review-section">
                        <div className="golden-section-heading"><div><span className="eyebrow">PASO 1</span><h3>Revisa los archivos</h3><p id="goldenReviewSummary" /></div><span id="goldenFileCount" className="golden-count" /></div>
                        <div id="goldenFiles" className="golden-file-list" />
                        <details id="goldenDiagnosticsDetails" className="golden-details golden-diagnostics"><summary id="goldenDiagnosticsSummary">Comprobaciones del Recorder</summary><pre id="goldenDiagnostics" /></details>
                    </section>
                    <section className="golden-review-section">
                        <div className="golden-section-heading"><div><span className="eyebrow">PASO 2</span><h3>Confirma tu revisión</h3><p>Indica el resultado que verificaste y cómo se usará el caso.</p></div></div>
                        <div className="golden-review-fields">
                            <label>Resultado en dispositivo<select id="goldenExecution" className="field-select"><option value="not-run">Todavía no ejecutado</option><option value="passed">Ejecutado correctamente</option><option value="failed">La ejecución falló</option></select><small>Declara solo lo que ejecutaste en dispositivo. Generar los archivos no equivale a ejecutar la prueba.</small></label>
                            <label>Uso del caso<select id="goldenUsage" className="field-select"><option value="reference">Ejemplo para los agentes</option><option value="evaluation">Reservado para evaluación</option></select><small id="goldenUsageHelp">Los agentes podrán consultarlo al generar otros casos.</small></label>
                            <label className="golden-notes">Notas (opcional)<textarea id="goldenNotes" className="field-input" rows={2} maxLength={4000} placeholder="Qué corregiste o qué debería tener en cuenta otro QA…" /></label>
                        </div>
                    </section>
                </div>
                <section id="goldenSaved" className="golden-empty golden-saved" style={{ display: 'none' }}>
                    <span className="golden-saved-icon" aria-hidden="true">✓</span><h3>Versión guardada · Ahora compártela</h3><p>Incluye los cambios de <code>tests/golden</code> en un commit y PR del Recorder. Si el caso cambia después del PR, recupera los cambios y aprueba una nueva versión.</p>
                    <button id="btnViewGoldenLibrary" type="button" className="btn btn-navy">Ver biblioteca golden</button>
                </section>
                <details id="goldenRepositoryDetails" className="golden-details golden-repository">
                    <summary><span>Repositorio compartido</span><code>tests/golden</code></summary>
                    <div className="golden-repository-content"><p>Los casos se guardan en el repositorio del Recorder. Se comparten con el equipo mediante un commit y PR.</p>
                        <code id="goldenDatasetPath" /><button id="btnSelectGoldenRepository" type="button" className="btn btn-dark">Cambiar repositorio</button></div>
                </details>
            </div>
            <footer id="goldenFooter" className="golden-footer">
                <p id="goldenLibraryHint">Para añadir un caso, abre «Revisar y guardar golden» desde su revisión. Si lo corregiste en el framework, usa «Revisión QA y golden → Revisar cambios del framework».</p>
                <div id="goldenReviewActions" className="golden-approval" style={{ display: 'none' }}>
                    <label><input id="goldenApproved" type="checkbox" /><span>He revisado los archivos y apruebo esta versión como caso golden.</span></label>
                    <button id="btnApproveGolden" type="button" className="btn btn-green" disabled>Aprobar y guardar golden</button>
                </div>
            </footer>
        </section>
    </div>;
}
