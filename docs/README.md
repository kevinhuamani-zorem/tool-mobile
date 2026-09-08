# Documentación técnica

Índice para mantener y operar Appium Recorder:

- [Arquitectura](ARCHITECTURE.md): componentes, límites y flujos principales.
- [Contrato de generación](GENERATION_CONTRACT.md): archivos, nombres,
  validaciones y política de escritura.
- [Historial de automatización](AUTOMATION_HISTORY.md): revisiones, intentos y recibos.
- [Exportación con observaciones](AUTOMATION_DRAFT_EXPORT.md): salida al framework, recibos parciales y protección de contenido compartido.
- [Generación en dos pasadas](AGENT_TWO_PASS_GENERATION.md): presupuesto común y borradores recuperables.
- [Desarrollo](DEVELOPMENT.md): preparación, comandos y estrategia de cambios.
- [Operación y troubleshooting](OPERATIONS_AND_TROUBLESHOOTING.md): modos,
  sesiones, diagnósticos y fallos frecuentes.
- [Aseguramiento de calidad](GENERATION_QUALITY_ASSURANCE.md): métricas,
  pruebas unitarias y controles manuales.
- [Mejoras pendientes de evaluación de agentes](AGENT_EVALUATION_IMPROVEMENTS.md):
  auditoría del 2026-09-07, backlog P0–P3 y criterios de aceptación;
  propuestas pendientes, no contratos nuevos ya implementados.
- [Fases de implementación](AGENT_EVALUATION_IMPLEMENTATION_PHASES.md): orden de entregas y criterios.
- [Avance y evidencia](AGENT_EVALUATION_PROGRESS.md): alcance implementado y validación.
- [ADR-0001: Arquitectura modular](adr/0001-modular-core-architecture.md):
  módulos, APIs públicas, dependencias y secuencia de migración.

Las reglas vinculantes para agentes están en [`../AGENTS.md`](../AGENTS.md).
Cuando documentación y código difieran, detén el cambio, confirma el contrato
con las pruebas y actualiza ambos en el mismo commit.
