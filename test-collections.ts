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
         items: []
      };
    }
    collections[cId].items.push({ cacheKey: key, title: item.name || item.title });
  }
}
console.log(JSON.stringify(Object.values(collections).filter((c: any) => c.items.length > 1), null, 2));
