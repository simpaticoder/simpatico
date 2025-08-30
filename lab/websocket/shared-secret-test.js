import * as crypto from './crypto.js';
const {encode, decode, stringToBits, bitsToString} = crypto;

let data = {
    client: {
        publicKey: 'QW17q0hnZxzGyPNjToXtqBiCvcyxMA9o9ZbzwMOziw0',
        privateKey: 'Y2xpZW50LXNlZWQtMTIzMDAwMDAwMDAwMDAwMDAwMDA',
        sharedSecret: 'Mfpc3JDxXVYK47kL6ZoaFPqT0OfiCwe0cbMIVNhmid0'
    },
    server: {
        publicKey: 'JAYrwjVrveFvh2DPXQUtsKpGTuFM3qtC1Jk1YH_nfkg',
        privateKey: 'amHjhuKE0HeqKOfYmZ45dbUXQgOop6-Sl7NuKM-3G2A',
        sharedSecret: '8nBcOFEy9nxA4V0nuwE274_KHNQH4R2svuqX4oc6H4E'
    }
}
let {client, server} = data;


let clientSharedSecret = crypto.deriveSharedSecret(decode(client.privateKey), decode(server.publicKey));
let serverSharedSecret = crypto.deriveSharedSecret(decode(server.privateKey), decode(client.publicKey));

console.log(encode(clientSharedSecret), encode(serverSharedSecret));

const results= {node:{}, browser:{}};
results.node.client = '8nBcOFEy9nxA4V0nuwE274_KHNQH4R2svuqX4oc6H4E';
results.node.server = '8nBcOFEy9nxA4V0nuwE274_KHNQH4R2svuqX4oc6H4E';
results.browser.client = '8nBcOFEy9nxA4V0nuwE274_KHNQH4R2svuqX4oc6H4E';
results.browser.server = '8nBcOFEy9nxA4V0nuwE274_KHNQH4R2svuqX4oc6H4E';

// Result: the client shared secret is WRONG for some reason