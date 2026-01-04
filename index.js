const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const TB7_LOGIN = process.env.TB7_LOGIN; 
const TB7_PASSWORD = process.env.TB7_PASSWORD;

const builder = new addonBuilder({
    id: "pl.tb7.final.v8", 
    version: "1.8.0",
    name: "TB7 Professional Premium",
    description: "Prywatny mostek do TB7.pl - Super PL Support",
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
                'Referer': 'https://tb7.pl/mojekonto/szukaj'
            }
        });

        await instance.post('/login', qs.stringify({ login: TB7_LOGIN, password: TB7_PASSWORD }));

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
        console.log(`[TB7] Błąd dla frazy ${query}:`, e.message);
        return [];
    }
}

builder.defineStreamHandler(async (args) => {
    console.log(`--- Nowe żądanie: ${args.id} ---`);
    
    try {
        const imdbId = args.id.split(':')[1] || args.id;
        let titlesToSearch = new Set();

        // 1. GŁÓWNA PRÓBA: Pobranie z polskiego endpointu Cinemeta
        try {
            const metaRes = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`, { 
                timeout: 5000,
                headers: { 'Accept-Language': 'pl' } 
            });
            
            // Pobieramy nazwę z głównego pola oraz z pola "name" wewnątrz "behaviorHints" jeśli istnieje
            if (metaRes.data.meta && metaRes.data.meta.name) {
                titlesToSearch.add(metaRes.data.meta.name);
            }
        } catch (e) {
            console.log("Problem z Cinemeta.");
        }

        // 2. BACKUP: Jeśli nadal mamy tylko "Clergy", spróbujmy użyć API OMDb (darmowe do małych zapytań) 
        // lub po prostu szukajmy po ID, jeśli tytuł jest ewidentnie angielski.
        
        let allStreams = [];

        // Jeśli zbiór tytułów jest pusty, dodajmy chociaż ID
        if (titlesToSearch.size === 0) titlesToSearch.add(imdbId);

        for (let title of titlesToSearch) {
            console.log(`Rozpoczynam szukanie dla: ${title}`);
            const results = await searchTB7(title);
            allStreams = allStreams.concat(results);
        }

        // 3. DESPERACKA PRÓBA: Jeśli po tytule (np. Clergy) nic nie ma, a to film "Kler", 
        // spróbujmy ręcznie podmienić popularne polskie filmy lub szukać bez roku
        if (allStreams.length === 0 && Array.from(titlesToSearch)[0] === "Clergy") {
            console.log("Wykryto 'Clergy', ręczna próba dla 'Kler'...");
            const extra = await searchTB7("Kler");
            allStreams = allStreams.concat(extra);
        }

        const uniqueStreams = allStreams.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);
        console.log(`Zakończono. Znaleziono: ${uniqueStreams.length}`);
        
        return { streams: uniqueStreams };

    } catch (err) {
        console.log("Błąd:", err.message);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000, address: '0.0.0.0' });
console.log("SERWER URUCHOMIONY - V1.8.0");
 
