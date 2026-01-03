const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const TB7_LOGIN = process.env.TB7_LOGIN; 
const TB7_PASSWORD = process.env.TB7_PASSWORD;

const builder = new addonBuilder({
    id: "pl.tb7.final.v5", 
    version: "1.5.0",
    name: "TB7 Professional",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

async function searchTB7(query) {
    try {
        const instance = axios.create({ 
            baseURL: 'https://tb7.pl',
            timeout: 15000,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://tb7.pl/mojekonto/szukaj'
            }
        });

        // 1. Logowanie
        await instance.post('/login', qs.stringify({ login: TB7_LOGIN, password: TB7_PASSWORD }));

        // 2. Wyszukiwanie na poprawnym adresie z Twojego screena
        console.log(`Szukanie na TB7: ${query}`);
        const searchRes = await instance.get(`/mojekonto/szukaj?q=${encodeURIComponent(query)}`);
        const $ = cheerio.load(searchRes.data);
        const streams = [];

        // 3. Parsowanie tabeli (dokładnie tak jak na screenie)
        $("table tr").each((i, el) => {
            const row = $(el).find("td");
            if (row.length >= 3) {
                const titleElement = $(row[1]).find("a").first(); // Nazwa pliku jest w drugiej kolumnie
                const title = titleElement.text().trim();
                const link = titleElement.attr("href");
                const size = $(row[2]).text().trim(); // Rozmiar w trzeciej kolumnie

                if (link && title) {
                    streams.push({
                        name: "TB7",
                        title: `📂 ${title}\n⚖️ ${size}`,
                        url: `https://tb7.pl${link}`
                    });
                }
            }
        });

        return streams;
    } catch (e) {
        console.log("Błąd TB7:", e.message);
        return [];
    }
}

builder.defineStreamHandler(async (args) => {
    console.log(`--- Zapytanie Stremio: ${args.id} ---`);
    try {
        // Pobieramy tytuł z Cinemeta
        const type = args.type || 'movie';
        const imdbId = args.id.split(':')[1];
        const metaRes = await axios.get(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`);
        const movieTitle = metaRes.data.meta.name;

        if (!movieTitle) throw new Error("Nie znaleziono tytułu");

        const results = await searchTB7(movieTitle);
        console.log(`Znaleziono plików: ${results.length}`);
        
        return { streams: results };
    } catch (err) {
        console.log("Błąd handlera:", err.message);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000, address: '0.0.0.0' });
console.log("SERWER URUCHOMIONY I CZEKA NA ZAPYTANIA ZE STREMIO");

