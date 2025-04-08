import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Recursively search for the most recently modified file.
 * @param directoryPath
 * @returns {string}
 */
export function findRecentFile(directoryPath = process.cwd()) {
    let mostRecentFile = '';
    let lastModifiedTime = 0;
    const allowedExtensions = ['.md', '.html'];

    // Get git ignored files/patterns
    let ignoredFiles = new Set();
    try {
        // Check if directory is in a git repo
        const gitOutput = execSync('git check-ignore --no-index $(find . -type f)', {
            cwd: directoryPath,
            stdio: ['pipe', 'pipe', 'ignore']
        }).toString().trim();

        // Add all ignored files to set
        if (gitOutput) {
            gitOutput.split('\n').forEach(file => {
                ignoredFiles.add(file.replace('./', ''));
            });
        }
    } catch (err) {
        // Not a git repo or git not installed, continue without exclusions
    }

    function processDirectory(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const entryPath = path.join(dir, entry.name);
            const relativePath = path.relative(directoryPath, entryPath);

            // Skip ignored files and directories
            if (ignoredFiles.has(relativePath)) {
                continue;
            }

            if (entry.isDirectory()) {
                // Skip hidden directories (like .git)
                if (entry.name.startsWith('.')) {
                    continue;
                }
                processDirectory(entryPath);
            } else if (entry.isFile()) {
                // Check file extension
                const ext = path.extname(entry.name);
                if (!allowedExtensions.includes(ext)) {
                    continue;
                }

                const stats = fs.statSync(entryPath);
                if (stats.mtimeMs > lastModifiedTime) {
                    lastModifiedTime = stats.mtimeMs;
                    mostRecentFile = entryPath;
                }
            }
        }
    }

    processDirectory(directoryPath);
    return mostRecentFile;
}

export default findRecentFile;