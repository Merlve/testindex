import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  const url = process.env.JELLYFIN_URL?.replace(/^["']|["']$/g, '');
  const apiKey = process.env.JELLYFIN_API_KEY?.replace(/^["']|["']$/g, '');
  
  try {
    const fetchUrl = `${url?.replace(/\/$/, '')}/Items?SortBy=DateCreated&SortOrder=Descending&Limit=30&Recursive=true&IncludeItemTypes=Movie,Episode,Series`;
    const res = await axios.get(fetchUrl, {
      headers: { 'X-Emby-Token': apiKey }
    });
    console.log(`Global items fetch: SUCCESS`, res.data?.Items?.length);
    console.log(`First item:`, res.data?.Items?.[0]?.Name);
  } catch (e: any) {
    console.log(`FAILED - ${e.response?.status} ${e.response?.statusText}`);
  }
}
test();
