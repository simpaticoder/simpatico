import * as crypto from './crypto.js';
const {encode, decode, stringToBits, bitsToString} = crypto;

let alice = {
    "name": "alice",
    "publicKeyString": "u3I5RMw41QpBtvUcogAZc_N5h3YCTHVWIJV-wlNXgFU",
    "privateKeyString": "eHkjk5vg6qo6BynuTPTnnSHtFlR8hX8gvuzWvyAiztk"
}

let bob = {
    "name": "bob",
    "publicKeyString": "KOiZFcEslzcVp65XDvZD0Kia7VMFGgtBDq7QFKqDhEE",
    "privateKeyString": "kpfW8bQ24Ez8s2ABsLRvPEy_30G-IvqOQ2Y6kRHpjXg"
}

let aliceSharedSecret = crypto.deriveSharedSecret(decode(alice.privateKeyString), decode(bob.publicKeyString));
let bobSharedSecret = crypto.deriveSharedSecret(decode(bob.privateKeyString), decode(alice.publicKeyString));

console.log(encode(aliceSharedSecret), encode(bobSharedSecret));
// Browser: 8ue5-nNYXjYRHYOZGXT8wA2l0VsAs0yWltdEr8pe5Ks 8ue5-nNYXjYRHYOZGXT8wA2l0VsAs0yWltdEr8pe5Ks
// Node: 8ue5-nNYXjYRHYOZGXT8wA2l0VsAs0yWltdEr8pe5Ks 8ue5-nNYXjYRHYOZGXT8wA2l0VsAs0yWltdEr8pe5Ks
