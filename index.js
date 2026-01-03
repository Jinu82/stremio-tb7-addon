const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const TB7_LOGIN = process.env.TB7_LOGIN; 
const TB7_PASSWORD = process.env.TB7_PASSWORD;

const builder = new addonBuilder({
    id: "pl.tb7.final.v6", 
    version: "1.6.0",
    name: "TB7 Professional Premium",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

async function searchTB7(query) {
    if (!query || query.length < 2) return [];
    try {
        const instance = axios.create({ 
            baseURL: 'https://tb7.pl',
            timeout: 15000,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
        });

        // Logowanie
        await instance.post('/login', qs.stringify({ login: TB7_LOGIN, password: TB7_PASSWORD }));

        // Wyszukiwanie
        console.log(`[TB7] Szukam frazy: ${query}`);
        const searchRes = await instance.get(`/mojekonto/szukaj?q=${encodeURIComponent(query)}`);
        const $ = cheerio.load(searchRes.data);
        const streams = [];

        $("table tr").each((i, el) => {
            const row = $(el).find("td");
            if (row.length >= 3) {
                const titleEl = $(row[1]).find("a").first();
                const title = titleEl.text().trim();
                const link = titleEl.attr("href");
                const size = $(row[2]).text().trim();

                if (link && title) {
                    streams.push({
                        name: "TB7",
                        title: `📥 ${title}\n⚖️ ${size}`,
                        url: `https://tb7.pl${link}`
                    });
                }
            }
        });
        return streams;
    } catch (e) {
        console.log("[TB7] Błąd wyszukiwania:", e.message);
        return [];
    }
}

builder.defineStreamHandler(async (args) => {
    console.log(`--- Nowe żądanie: ${args.id} ---`);
    
    try {
        let movieTitle = "";
        const imdbId = args.id.split(':')[1] || args.id;

        // PRÓBA 1: Pobranie z Cinemeta (główne źródło)
        try {
            const metaRes = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`, { timeout: 4000 });
            movieTitle = metaRes.data.meta.name;
        } catch (e) {
            console.log("Cinemeta zawiodła, próbuję alternatywy...");
            
            // PRÓBA 2: Pobranie z zapasowego API Stremio
            try {
                const altRes = await axios.get(`https://v2.sg.media-imdb.com/suggestion/t/${imdbId}.json`, { timeout: 4000 });
                movieTitle = altRes.data.d[0].l;
            } catch (e2) {
                console.log("Nie udało się ustalić tytułu filmu.");
            }
        }

        // Jeśli udało się ustalić tytuł, szukamy na TB7
        if (movieTitle) {
            console.log(`Ustalony tytuł: ${movieTitle}`);
            const results = await searchTB7(movieTitle);
            return { streams: results };
        }

        return { streams: [] };
    } catch (err) {
        console.log("Błąd krytyczny:", err.message);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000, address: '0.0.0.0' });
console.log("SERWER URUCHOMIONY - V1.6.0");
 
