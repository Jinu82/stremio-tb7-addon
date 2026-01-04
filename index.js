const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

// Pobieranie danych logowania ze zmiennych środowiskowych Render
const TB7_LOGIN = process.env.TB7_LOGIN; 
const TB7_PASSWORD = process.env.TB7_PASSWORD;

const builder = new addonBuilder({
    id: "pl.tb7.final.v7", 
    version: "1.7.0",
    name: "TB7 Professional Premium",
    description: "Prywatny mostek do TB7.pl - Obsługa wielu języków",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

// Funkcja wyszukująca na TB7
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

        // Logowanie
        await instance.post('/login', qs.stringify({ login: TB7_LOGIN, password: TB7_PASSWORD }));

        // Wyszukiwanie na poprawnym adresie
        console.log(`[TB7] Szukam frazy: ${query}`);
        const searchRes = await instance.get(`/mojekonto/szukaj?q=${encodeURIComponent(query)}`);
        const $ = cheerio.load(searchRes.data);
        const streams = [];

        // Parsowanie tabeli wyników
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

// Obsługa żądań o strumienie
builder.defineStreamHandler(async (args) => {
    console.log(`--- Nowe żądanie: ${args.id} ---`);
    
    try {
        const imdbId = args.id.split(':')[1] || args.id;
        let titlesToSearch = new Set();

        // 1. Próba pobrania nazwy filmu z wymuszeniem języka polskiego
        try {
            const metaRes = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`, { 
                timeout: 4000,
                headers: { 'Accept-Language': 'pl-PL,pl;q=0.9' } 
            });
            if (metaRes.data.meta && metaRes.data.meta.name) {
                titlesToSearch.add(metaRes.data.meta.name);
            }
        } catch (e) {
            console.log("Cinemeta PL nie odpowiedziała.");
        }

        // 2. Próba pobrania nazwy oryginalnej/angielskiej (zapasowa)
        try {
            const metaEn = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`, { timeout: 4000 });
            if (metaEn.data.meta && metaEn.data.meta.name) {
                titlesToSearch.add(metaEn.data.meta.name);
            }
        } catch (e) { }

        let allStreams = [];

        // Przeszukujemy TB7 dla wszystkich unikalnych tytułów (np. "Kler" i "Clergy")
        for (let title of titlesToSearch) {
            console.log(`Rozpoczynam szukanie dla: ${title}`);
            const results = await searchTB7(title);
            allStreams = allStreams.concat(results);
        }

        // Usuwanie duplikatów (jeśli te same pliki znaleziono dla różnych fraz)
        const uniqueStreams = allStreams.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);

        console.log(`Zakończono. Znaleziono łącznie: ${uniqueStreams.length} źródeł.`);
        return { streams: uniqueStreams };

    } catch (err) {
        console.log("Błąd krytyczny dodatku:", err.message);
        return { streams: [] };
    }
});

// Uruchomienie serwera
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000, address: '0.0.0.0' });
console.log("SERWER URUCHOMIONY - WERSJA 1.7.0");
 
