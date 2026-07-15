import axios from 'axios';
import fs from 'fs';
import path from 'path';

const NOTIFIED_DB = path.join(process.cwd(), 'notified.json');

let notifiedItems = new Set<string>();
if (fs.existsSync(NOTIFIED_DB)) {
    try {
        const data = JSON.parse(fs.readFileSync(NOTIFIED_DB, 'utf-8'));
        notifiedItems = new Set(data);
    } catch (e) {}
}

function saveNotified() {
    fs.writeFileSync(NOTIFIED_DB, JSON.stringify(Array.from(notifiedItems)));
}

const COUNTRY_MAP: Record<string, [string, string]> = {
    "US": ["USA", "🇺🇸"], "GB": ["UK", "🇬🇧"],
    "CA": ["CAN", "🇨🇦"], "FR": ["FRA", "🇫🇷"],
    "DE": ["GER", "🇩🇪"], "IT": ["ITA", "🇮🇹"],
    "ES": ["ESP", "🇪🇸"], "JP": ["JPN", "🇯🇵"],
    "KR": ["KOR", "🇰🇷"], "CN": ["CHN", "🇨🇳"],
    "IN": ["IND", "🇮🇳"], "AU": ["AUS", "🇦🇺"],
    "MX": ["MEX", "🇲🇽"], "BR": ["BRA", "🇧🇷"],
    "RU": ["RUS", "🇷🇺"], "NG": ["NGR", "🇳🇬"],
    "IE": ["IRL", "🇮🇪"], "NZ": ["NZL", "🇳🇿"]
};

function getGenreEmoji(genre: string): string {
    const mapping: Record<string, string> = {
        "horror": "🔪", "science fiction": "🚀", "sci-fi": "🚀", "comedy": "😂",
        "action": "💥", "adventure": "🤠", "drama": "🎭", "fantasy": "🧙",
        "animation": "🎨", "documentary": "📹", "thriller": "😱", "romance": "❤️",
        "crime": "🕵️", "mystery": "🔍", "family": "👨‍👩‍👧", "war": "🎖️",
        "western": "🌵", "history": "📜", "music": "🎸"
    };
    return mapping[genre.toLowerCase().trim()] || "🎬";
}

function escapeHtml(unsafe: string): string {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function formatSize(sizeBytes?: number): string | null {
    if (!sizeBytes) return null;
    let size = sizeBytes;
    const units = ["B", "KB", "MB", "GB", "TB"];
    for (const unit of units) {
        if (size < 1024) {
            return (unit === 'GB' || unit === 'TB') ? \`\${size.toFixed(2)} \${unit}\` : \`\${size.toFixed(0)} \${unit}\`;
        }
        size /= 1024;
    }
    return \`\${size.toFixed(2)} PB\`;
}

async function getTmdbEnrich(providerIds: any, itemType: string) {
    const tmdbKey = process.env.TMDB_API_KEY;
    if (!tmdbKey) return {};
    const tmdbId = providerIds?.Tmdb || providerIds?.tmdb;
    if (!tmdbId) return {};
    
    const path = itemType.toLowerCase() === 'movie' ? 'movie' : 'tv';
    const link = \`https://www.themoviedb.org/\${path}/\${tmdbId}\`;
    
    try {
        const res = await axios.get(\`https://api.themoviedb.org/3/\${path}/\${tmdbId}?api_key=\${tmdbKey}\`);
        return { tagline: res.data.tagline, tmdb_rating: res.data.vote_average, tmdb_link: link };
    } catch (e) {
        return { tmdb_link: link };
    }
}

function buildInlineKeyboard(openlistLink?: string) {
    const keyboard = [
        [
            { text: "JOIN SHUTTER", url: "https://shutter.ng" },
            { text: "VISIT INDEX", url: "https://my.shutter.ng" }
        ]
    ];
    if (openlistLink) {
        const btnText = process.env.OPENLIST_BUTTON_TEXT || "📂 DOWNLOAD / STREAM";
        keyboard.unshift([{ text: btnText, url: openlistLink }]);
    }
    return { inline_keyboard: keyboard };
}

async function sendTelegramMessage(text: string, openlistLink?: string, photoUrl?: string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return null;

    const payload = {
        chat_id: chatId,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: buildInlineKeyboard(openlistLink)
    };

    try {
        if (photoUrl) {
            const r = await axios.post(\`https://api.telegram.org/bot\${botToken}/sendPhoto\`, {
                ...payload,
                photo: photoUrl,
                caption: text
            });
            return r.data?.result?.message_id;
        } else {
            const r = await axios.post(\`https://api.telegram.org/bot\${botToken}/sendMessage\`, {
                ...payload,
                text: text
            });
            return r.data?.result?.message_id;
        }
    } catch (e: any) {
        console.error("Telegram send error", e.response?.data || e.message);
        return null;
    }
}

async function pinTelegramMessage(messageId: number) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;
    
    try {
        await axios.post(\`https://api.telegram.org/bot\${botToken}/pinChatMessage\`, {
            chat_id: chatId,
            message_id: messageId,
            disable_notification: true
        });
    } catch (e: any) {
        console.error("Telegram pin error", e.message);
    }
}

export async function processJellyfinTelegram(items: any[], getOpenlistUrl: () => string) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;

    // Process from oldest to newest in the list
    for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (!it.Id || notifiedItems.has(it.Id)) continue;

        try {
            const itemType = it.Type || "";
            const name = it.Name || "Unknown";
            const year = it.ProductionYear;
            const rating = it.CommunityRating;
            const overview = it.Overview || "";
            const genres = it.Genres || [];
            const people = it.People || [];
            const providerIds = it.ProviderIds || {};
            const countries = it.ProductionLocations || [];

            let countryText = "";
            if (countries.length > 0) {
                const cFormatted = countries.map((c: string) => {
                    const info = COUNTRY_MAP[c.toUpperCase()];
                    return info ? \`\${info[1]} \${info[0]}\` : c.toUpperCase();
                });
                countryText = \`\n<b>COUNTRY OF ORIGIN:</b> \${cFormatted.join(", ")}\`;
            }

            let header = "";
            if (itemType.toLowerCase() === "episode") {
                const seriesName = it.SeriesName || "";
                let titleLine = escapeHtml(seriesName);
                if (year) titleLine += \` (\${year})\`;
                if (it.ParentIndexNumber !== undefined && it.IndexNumber !== undefined) {
                    titleLine += \` — S\${String(it.ParentIndexNumber).padStart(2, '0')}E\${String(it.IndexNumber).padStart(2, '0')}\`;
                }
                titleLine += \` — \${escapeHtml(name)}\`;
                header = \`🆕 <b>New Episode</b>\n<b>\${titleLine}</b>\n\`;
            } else if (itemType.toLowerCase() === "series") {
                header = \`🆕 <b>New Series</b>\n<b>\${escapeHtml(name)}</b>\`;
                if (year) header += \` (\${year})\`;
                header += "\\n";
            } else {
                header = \`🆕 <b>New Movie</b>\n<b>\${escapeHtml(name)}</b>\`;
                if (year) header += \` (\${year})\`;
                header += "\\n";
            }

            const genreText = genres.length > 0 ? \`\n<b>GENRE:</b> \${genres.map((g: string) => \`\${getGenreEmoji(g)} \${g}\`).join(", ")}\` : "";
            
            const actors = people.filter((p: any) => p.Type === "Actor").slice(0, 4);
            const actorLinks = actors.map((a: any) => {
                const aName = escapeHtml(a.Name);
                const aTmdb = a.ProviderIds?.Tmdb;
                return aTmdb ? \`<a href='https://www.themoviedb.org/person/\${aTmdb}'>\${aName}</a>\` : aName;
            });
            const actorText = actors.length > 0 ? \`\n<b>ACTORS:</b> \${actorLinks.join(", ")}\` : "";

            const rtMin = it.RunTimeTicks ? Math.floor((it.RunTimeTicks / 10000000) / 60) : null;
            
            let size = null;
            let resolution = null;
            const sources = it.MediaSources || [];
            if (sources.length > 0) {
                size = formatSize(sources[0].Size);
                const streams = sources[0].MediaStreams || [];
                const videoStreams = streams.filter((s: any) => s.Type === 'Video' && !['mjpeg','png','jpeg','jpg','bmp','gif'].includes((s.Codec || '').toLowerCase()));
                if (videoStreams.length > 0) {
                    const bestStream = videoStreams.reduce((prev: any, current: any) => (prev.Height > current.Height) ? prev : current);
                    if (bestStream.DisplayTitle) {
                        const m = bestStream.DisplayTitle.match(/(\d{3,4}p|4k|8k)/i);
                        if (m) resolution = m[1].toUpperCase();
                    }
                    if (!resolution && bestStream.Height) {
                        if (bestStream.Height >= 2160) resolution = '4K';
                        else if (bestStream.Height >= 1440) resolution = '2K';
                        else if (bestStream.Height >= 1080) resolution = '1080p';
                        else if (bestStream.Height >= 720) resolution = '720p';
                        else if (bestStream.Height >= 480) resolution = '480p';
                        else resolution = \`\${bestStream.Height}p\`;
                    }
                }
            }

            const facts = [];
            if (rtMin) facts.push(\`⏱ \${rtMin} min\`);
            if (rating) facts.push(\`⭐   \${parseFloat(rating).toFixed(1)}/10\`);
            if (resolution) facts.push(\`📺 \${resolution}\`);
            if (size) facts.push(\`💾 \${size}\`);

            const enrich = await getTmdbEnrich(providerIds, itemType);
            if (enrich.tmdb_rating && itemType.toLowerCase() !== "episode") {
                facts.push(\`🎬 TMDB \${parseFloat(enrich.tmdb_rating).toFixed(1)}/10\`);
            }

            const parts = [header, genreText, actorText, countryText];
            if (facts.length > 0) {
                parts.push("\\n" + facts.join(" • "));
            }
            if (enrich.tagline) {
                parts.push(\`\\n<i>\${escapeHtml(enrich.tagline)}</i>\`);
            }
            if (overview) {
                let ov = overview.replace(/\s+/g, ' ').trim();
                ov = ov.length > 400 ? ov.substring(0, 397) + "…" : ov;
                parts.push(\`\\n\\n<blockquote>\${escapeHtml(ov)}</blockquote>\`);
            }

            let text = parts.join("");
            if (text.length > 1000) text = text.substring(0, 1000) + "…";

            // Figure out openlist link
            // For now, if we already matched this item in our recentlyAddedCache, we can pass that link.
            // Since this runs right after Jellyfin fetch, we can check if it's in openlistSearchCache.
            let openlistLink = undefined;
            // (We'll wire this up by letting jellyfin.ts pass the matched openlist url if found)
            if (it._openlist_url) {
                openlistLink = it._openlist_url;
            }

            const jfPublicUrl = (process.env.JELLYFIN_PUBLIC_URL || process.env.JELLYFIN_URL || '').replace(/\/$/, '');
            let imgUrl = undefined;
            if (process.env.SEND_POSTER !== "0" && it.Id) {
                imgUrl = \`\${jfPublicUrl}/Items/\${it.Id}/Images/Primary?maxHeight=900&quality=90\`;
            }

            const messageId = await sendTelegramMessage(text, openlistLink, imgUrl);
            
            notifiedItems.add(it.Id);
            saveNotified();

            if (messageId && itemType.toLowerCase() === 'movie') {
                await pinTelegramMessage(messageId);
            }

        } catch (e: any) {
            console.error(\`Error processing Telegram for \${it.Id}: \${e.message}\`);
        }
    }
}
