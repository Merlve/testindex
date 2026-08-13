const value = {};
for (let i = 0; i < 500000; i++) {
  value[`key_${i}`] = { a: "test", b: 1234, c: [1,2,3], d: { nested: true } };
}

let chunks = [];
chunks.push('{');
let first = true;
for (const k in value) {
  if (!first) chunks.push(',');
  first = false;
  chunks.push(JSON.stringify(k) + ':' + JSON.stringify(value[k]));
}
chunks.push('}');
let str = chunks.join('');
console.log(str.length);
