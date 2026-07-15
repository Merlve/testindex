import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  const url = process.env.JELLYFIN_URL?.replace(/^["']|["']$/g, '');
  const apiKey = process.env.JELLYFIN_API_KEY?.replace(/^["']|["']$/g, '');
  const userId = process.env.JELLYFIN_USER_ID?.replace(/^["']|["']$/g, '');
  
  const endpoints = [
    `/Users/${userId}/Items/Latest`,
    `/Users/${userId}/Items?SortBy=DateCreated&SortOrder=Descending&Limit=30&IncludeItemTypes=Movie,Episode,Series`,
  ];
  
  for (const endpoint of endpoints) {
    try {
      const fetchUrl = `${url?.replace(/\/$/, '')}${endpoint}`;
      console.log(`Testing ${fetchUrl}`);
      const res = await axios.get(fetchUrl, {
        headers: { 'X-Emby-Token': apiKey }
      });
      console.log(`SUCCESS:`, res.data?.length ?? res.data?.Items?.length);
    } catch (e: any) {
      console.log(`FAILED - ${e.response?.status} ${e.response?.statusText}`);
    }
  }
}
test();
