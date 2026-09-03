import fs from 'fs';
import os from 'os';
import path from 'path';
import { modelFromCopilotEvent } from '../domain/agentModel';

/** Reads only the session UUID assigned by the recorder, incrementally.
 * Conversation content is discarded; only model IDs leave this reader.
 */
export class CopilotModelEvents {
    private offset = 0;
    private pending = '';
    private droppingLine = false;
    private models = new Set<string>();
    constructor(private readonly file: string) {}

    static forSession(sessionId: string): CopilotModelEvents {
        if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error('Invalid Copilot session ID');
        return new CopilotModelEvents(path.join(process.env.COPILOT_HOME || path.join(os.homedir(), '.copilot'), 'session-state', sessionId, 'events.jsonl'));
    }

    read(): string[] {
        let fd: number | undefined;
        try {
            fd = fs.openSync(this.file, 'r');
            const size = fs.fstatSync(fd).size;
            if (size < this.offset) { this.offset = 0; this.pending = ''; this.droppingLine = false; }
            const buffer = Buffer.alloc(Math.min(1024 * 1024, Math.max(0, size - this.offset)));
            const count = fs.readSync(fd, buffer, 0, buffer.length, this.offset);
            this.offset += count;
            const lines = (this.pending + buffer.toString('utf8', 0, count)).split('\n');
            this.pending = lines.pop() || '';
            for (const line of lines) {
                if (this.droppingLine) { this.droppingLine = false; continue; }
                try {
                    const model = modelFromCopilotEvent(JSON.parse(line));
                    if (model) this.models.add(model);
                } catch { /* Partial/unknown CLI events never block generation. */ }
            }
            if (this.pending.length > 1024 * 1024) { this.pending = ''; this.droppingLine = true; }
        } catch { /* Missing session telemetry is explicitly reported as unknown. */ }
        finally { if (fd !== undefined) fs.closeSync(fd); }
        return [...this.models];
    }
}
