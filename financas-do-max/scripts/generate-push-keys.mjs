import webpush from 'web-push';
import {randomBytes} from 'node:crypto';
const keys=webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nCRON_SECRET=${randomBytes(32).toString('base64url')}`);
