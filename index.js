const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const TB7_LOGIN = 'Jinu82'; // <--- WPISZ TUTAJ
const TB7_PASSWORD = 'skCvR5E#KYdR5V#'; // <--- WPISZ TUTAJ

const builder = new addonBuilder({
    id: "org.tb7.fanfilm.logic",
    version: "1.1.0",
    name: "TB7 Professional Bridge",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

async function getMeta(id) {
    try {
        const type = id.split(':')[0];
        const res = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${id.split(':')[1]}.json`);
        return res.data.meta;
    } catch (e) { return null; }
}

builder.defineStreamHandler(async (args) => {
    const meta = await getMeta(args.id);
    const imdbId = args.id.split(':')[1];
    if (!meta) return { streams: [] };

    console.log(`--- Zapytanie dla: ${meta.name} (IMDb: ${imdbId}) ---`);

    try {
        // Używamy "Cookie Jar" do zachowania sesji
        const instance = axios.create({ 
            baseURL: 'https://tb7.pl',
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://tb7.pl/'
            },
            withCredentials: true
        });

        // 1. Logowanie z pobraniem ciasteczek
        await instance.post('/login', qs.stringify({ login: TB7_LOGIN, password: TB7_PASSWORD }));

        // 2. Szukanie - najpierw po IMDb ID, potem po tytule (tak robi FanFilm)
        let searchRes = await instance.get(`/search?q=${imdbId}`);
        let $ = cheerio.load(searchRes.data);
        
        // Jeśli brak wyników po IMDb, szukaj po nazwie
        if ($("table tr").length <= 1) {
            console.log("Brak wyników po ID, szukam po tytule...");
            searchRes = await instance.get(`/search?q=${encodeURIComponent(meta.name)}`);
            $ = cheerio.load(searchRes.data);
        }

        const streams = [];

        // 3. Wyciąganie linków
        $("table tr").each((i, el) => {
            const row = $(el).find("td");
            if (row.length > 0) {
                const title = $(row[0]).text().trim();
                const downloadLink = $(row[0]).find("a[href*='download']").attr("href");
                const size = $(row[2]).text().trim() || "N/A";

                if (downloadLink) {
                    streams.push({
                        name: "TB7 Premium",
                        title: `${title}\n💾 Rozmiar: ${size}`,
                        url: `https://tb7.pl${downloadLink}`
                    });
                }
            }
        });

        console.log(`Zakończono: znaleziono ${streams.length} źródeł.`);
        return { streams };

    } catch (e) {
        console.log("Błąd:", e.message);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000, address: '0.0.0.0' });
