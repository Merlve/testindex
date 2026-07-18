const axios = require('axios');
require('dotenv').config();

async function test() {
  const tmdbKey = process.env.TMDB_API_KEY;
  const res = await axios.get(`https://api.themoviedb.org/3/search/movie?api_key=${tmdbKey}&query=mortal%20kombat`);
  console.log("Search Result keys:", Object.keys(res.data.results[0]));
  console.log("belongs_to_collection:", res.data.results[0].belongs_to_collection);
  
  const movieRes = await axios.get(`https://api.themoviedb.org/3/movie/${res.data.results[0].id}?api_key=${tmdbKey}`);
  console.log("Details Result keys:", Object.keys(movieRes.data).slice(0, 5));
  console.log("belongs_to_collection in details:", movieRes.data.belongs_to_collection);
}
test();
