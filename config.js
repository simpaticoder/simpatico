// config.js
import fs from 'node:fs';
import process from 'node:process';

import {
    DEFAULT_CONFIG,
    buildConfig,
    parseJson,
} from './reflector-core.js';

export function readConfigFile({
                                   filePath,
                                   readFileSync = fs.readFileSync,
                                   existsSync = fs.existsSync,
                               }) {
    if (!existsSync(filePath)) {
        return {};
    }

    const content = readFileSync(filePath, 'utf8');

    return parseJson(content, {});
}

export function loadConfig({
                               env = process.env,
                               argv = process.argv,
                               cwd = process.cwd(),
                               packageJson = JSON.parse(
                                   fs.readFileSync('./package.json', 'utf8')
                               ),
                               now = new Date(),
                               started = now.toUTCString(),
                               envPrefix = 'SIMP_',
                               readFileSync = fs.readFileSync,
                               existsSync = fs.existsSync,
                           }) {
    const configFile =
        env[`${envPrefix}CONFIGFILE`] ||
        DEFAULT_CONFIG.configFile;

    const fileConfig = readConfigFile({
        filePath: configFile,
        readFileSync,
        existsSync,
    });

    return buildConfig({
        defaults: {
            ...DEFAULT_CONFIG,
            documentRoot: cwd,
        },
        fileConfig,
        env,
        argv,
        packageJson,
        cwd,
        started,
        now,
        envPrefix,
    });
}
