import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

export default {
    input: './node_modules/tweetnacl/nacl.js',
    output: {
        file: './vendor/nacl.js',
        format: 'esm',
    },
    external: ['crypto'],
    plugins: [
        resolve(), // Resolves node_modules
        commonjs(), // Converts CommonJS to ES modules
    ],
};
