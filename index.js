const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

// Pobieramy Twoje ciasteczko z ustawień Render
const TB7_COOKIE = process.env.TB7_COOKIE; 

const builder = new addonBuilder({
    id: "pl.tb7.final.v23", 
    version: "2.3.0",
    name: "TB7 Pro Session",
    description: "Mostek TB7 - Autoryzacja przez Token Sesji",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

builder.defineStreamHandler(async (args) => {
    console.log(`--- Zapytanie o: ${args.id} ---`);
    const imdbId = args.id.split(':')[1] || args.id;
    
    // Fallback dla Kleru
    let movieTitle = (imdbId === "tt8738964") ? "Kler" : "";

    if (!movieTitle) {
        try {
            const meta = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`, { 
                headers: { 'Accept-Language': 'pl' },
                timeout: 3000
            });
            movieTitle = meta.data.meta.name;
        } catch (e) { 
            console.log("Nie udało się pobrać tytułu, używam ID.");
            movieTitle = imdbId; 
        }
    }

    try {
        const client = axios.create({
            baseURL: 'https://tb7.pl',
            timeout: 12000,
            headers: {
                'Cookie': TB7_COOKIE,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        console.log(`[TB7] Szukam frazy: ${movieTitle}`);
        // Wyszukiwanie bezpośrednio na podstronie mojekonto
        const res = await client.get(`/mojekonto/szukaj?q=${encodeURIComponent(movieTitle)}`);
        
        // Sprawdzamy, czy sesja nadal działa (szukamy Twojego loginu Jinu82 na stronie)
        if (!res.data.includes("Jinu82") && !res.data.includes("Wyloguj")) {
            console.log("[BŁĄD] Sesja wygasła lub dane w TB7_COOKIE są błędne!");
            return { streams: [] };
        }

        const $ = cheerio.load(res.data);
        const streams = [];

        // Parsowanie tabeli (dokładnie wg Twojego screena)
        $("table tr").each((i, el) => {
            const row = $(el).find("td");
            // Link do pobierania jest zawsze w drugiej kolumnie (index 1)
            const linkEl = $(row[1]).find("a").first();
            
            if (linkEl.length > 0) {
                const title = linkEl.text().trim();
                const link = linkEl.attr("href");
                const size = $(row[2]).text().trim() || "N/A";

                if (link && title) {
                    streams.push({
                        name: "TB7 Premium",
                        title: `📥 ${title}\n⚖️ Wielkość: ${size}`,
                        url: link.startsWith('http') ? link : `https://tb7.pl${link}`
                    });
                }
            }
        });

        console.log(`[SUCCESS] Znaleziono: ${streams.length} wyników.`);
        return { streams: streams };

    } catch (err) {
        console.log("[FATAL ERROR]:", err.message);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000, address: '0.0.0.0' });
console.log("SERWER URUCHOMIONY - V2.3.0");
 
