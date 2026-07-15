import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  const url = process.env.JELLYFIN_URL?.replace(/^["']|["']$/g, '');
  const apiKey = process.env.JELLYFIN_API_KEY?.replace(/^["']|["']$/g, '');
  const userId = process.env.JELLYFIN_USER_ID?.replace(/^["']|["']$/g, '');
  
  console.log("URL:", url);
  console.log("API Key length:", apiKey?.length);
  console.log("User ID:", userId);

  const tests = [
    { name: "X-Emby-Token only", headers: { 'X-Emby-Token': apiKey } },
    { name: "Authorization MediaBrowser Token", headers: { 'Authorization': `MediaBrowser Token="${apiKey}"` } },
    { name: "Authorization MediaBrowser Token no quotes", headers: { 'Authorization': `MediaBrowser Token=${apiKey}` } },
    { name: "Authorization Bearer", headers: { 'Authorization': `Bearer ${apiKey}` } },
    { name: "Query param api_key", headers: {}, params: { api_key: apiKey } },
    { name: "Custom headers 1", headers: { 'X-Emby-Authorization': `MediaBrowser Client="Other", Device="Other", DeviceId="123", Version="1.0.0", Token="${apiKey}"` } }
  ];

  for (const t of tests) {
    try {
      console.log(`Testing ${t.name}...`);
      await axios.get(`${url?.replace(/\/$/, '')}/Users/${userId}/Items/Latest?Limit=1`, {
        headers: t.headers,
        params: t.params
      });
      console.log(`SUCCESS: ${t.name}`);
    } catch (e: any) {
      console.log(`FAILED: ${t.name} - ${e.response?.status} ${e.response?.statusText}`);
    }
  }
}
test();
