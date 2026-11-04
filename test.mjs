// 本地试跑：不装扩展也能验逻辑。node test.mjs [消息编号]
import { ForwardReaderWorld } from './src/index.js';
import { DEFAULTS } from './src/config.js';

const world = new ForwardReaderWorld({ cfg: { ...DEFAULTS, enabled: true }, botDir: '' });

const ref = process.argv[2] || '265277450';
console.log('=== status ===');
console.log(await world.status());
console.log('=== read ' + ref + ' ===');
const res = await world.read({ ref, captions: process.argv[3] === 'img' });
console.log(typeof res === 'string' ? res : res.text);
