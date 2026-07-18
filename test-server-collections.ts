import fs from 'fs';

const cache = JSON.parse(fs.readFileSync('db.json', 'utf8'));
const collections: Record<number, any> = {};

for (const key in cache) {
  const item = cache[key];
  if (item && item.belongs_to_collection) {
    const cId = item.belongs_to_collection.id;
    if (!collections[cId]) {
      collections[cId] = {
         id: cId,
         name: item.belongs_to_collection.name,
         poster_path: item.belongs_to_collection.poster_path,
         backdrop_path: item.belongs_to_collection.backdrop_path,
         queries: []
      };
    }
    // Extract query from key: e.g. "MOVIES-mortal kombat-1995" -> "mortal kombat"
    const match = key.match(/^[A-Z]+-(.+?)(?:-\d{4})?$/);
    if (match) {
        collections[cId].queries.push(match[1]);
    } else {
        collections[cId].queries.push(key.replace(/^[A-Z]+-/, ''));
    }
  }
}
console.log(Object.values(collections).slice(0, 2));
