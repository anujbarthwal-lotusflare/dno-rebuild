import { resolve } from 'node:path';
import type { LayoutFileOptions } from './layouts.ts';

/**
 * Where committed layout versions are written, from the environment:
 *   DNO_LAYOUT_DIR        folder (default <project>/layouts; "off" keeps versions in the database only)
 *   DNO_LAYOUT_GIT=1      git add + commit that folder after each version
 *   DNO_LAYOUT_GIT_PUSH=1 also git push
 */
export function layoutFilesFromEnv(projectRoot: string, log: (line: string) => void): LayoutFileOptions {
    const raw = process.env.DNO_LAYOUT_DIR;
    if (raw === 'off') return {};
    return {
        dir: raw ? resolve(raw) : resolve(projectRoot, 'layouts'),
        gitCommit: process.env.DNO_LAYOUT_GIT === '1',
        gitPush: process.env.DNO_LAYOUT_GIT_PUSH === '1',
        log,
    };
}
