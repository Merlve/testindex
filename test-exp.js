const fs = require('fs');
let expirations = JSON.parse(fs.readFileSync('users_expirations.json', 'utf-8'));
console.log("Before:", expirations);
