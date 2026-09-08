#!/usr/bin/env node
// Compatibilidad del comando anterior: nunca vuelve a activar memoria por score.
console.error('La siembra de memoria legacy está retirada. Los casos golden existentes se conservan; el índice basado en revisiones aprobadas por QA se implementará en F6.');
process.exitCode = 1;
