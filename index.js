const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const TB7_COOKIE = process.env.TB7_COOKIE; 

const builder = new addonBuilder({
    id: "pl.tb7.final.v27", 
    version: "2.7.0",
    name: "TB7 Professional Premium",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
});

builder.defineStreamHandler(async (args) => {
    console.log(`--- Żądanie Stremio: ${args.id} ---`);
    const imdbId = args.id.split(':')[1] || args.id;
    
    // Rozpoznawanie tytułu (priorytet dla Kler)
    let movieTitle = (imdbId === "tt8738964") ? "Kler" : "";

    if (!movieTitle) {
        try {
            const meta = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`, { 
                headers: { 'Accept-Language': 'pl' },
                timeout: 5000 
            });
            movieTitle = meta.data.meta.name;
        } catch (e) { movieTitle = imdbId; }
    }

    try {
        const client = axios.create({
            baseURL: 'https://tb7.pl',
            timeout: 10000,
            headers: {
                'Cookie': TB7_COOKIE,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        console.log(`[TB7] Szukam frazy: ${movieTitle}`);
        const res = await client.get(`/mojekonto/szukaj?q=${encodeURIComponent(movieTitle)}`);
        
        // Sprawdzenie sesji na podstawie Twojego loginu
        if (!res.data.includes("Jinu82") && !res.data.includes("Wyloguj")) {
            console.log("[BŁĄD] Serwer TB7 odrzucił sesję. Zaktualizuj TB7_COOKIE w Render.");
            return { streams: [] };
        }

        const $ = cheerio.load(res.data);
        const streams = [];

        // Przeszukiwanie tabeli z wynikami
        $("table tr").each((i, el) => {
            const row = $(el).find("td");
            // Na Twoim zrzucie: Kolumna 2 (index 1) to Nazwa pliku z linkiem
            const linkEl = $(row[1]).find("a").first();
            const size = $(row[2]).text().trim(); // Kolumna 3 (index 2) to Rozmiar

            if (linkEl.length > 0) {
                const title = linkEl.text().trim();
                const link = linkEl.attr("href");

                if (link && title.length > 2) {
                    streams.push({
                        name: "TB7 Premium",
                        title: `📥 ${title}\n⚖️ ${size}`,
                        url: link.startsWith('http') ? link : `https://tb7.pl${link}`
                    });
                }
            }
        });

        console.log(`[SUKCES] Znaleziono linków: ${streams.length}`);
        return { streams: streams };

    } catch (err) {
        console.log("[ERROR KRYTYCZNY]:", err.message);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000, address: '0.0.0.0' });
console.log("SERWER V2.7.0 GOTOWY");
