const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");

const TB7_COOKIE = process.env.TB7_COOKIE; 

const builder = new addonBuilder({
    id: "pl.tb7.final.v29", 
    version: "2.9.0",
    name: "TB7 Professional Premium",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

builder.defineStreamHandler(async (args) => {
    const imdbId = args.id.split(':')[1] || args.id;
    let movieTitle = (imdbId === "tt8738964") ? "Kler" : "";

    if (!movieTitle) {
        try {
            const meta = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`, { 
                headers: { 'Accept-Language': 'pl' }
            });
            movieTitle = meta.data.meta.name;
        } catch (e) { movieTitle = imdbId; }
    }

    try {
        const client = axios.create({
            baseURL: 'https://tb7.pl',
            headers: { 'Cookie': TB7_COOKIE, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        // KROK 1: Wyszukiwanie (Twój ostatni zrzut ekranu)
        const res = await client.get(`/mojekonto/szukaj?q=${encodeURIComponent(movieTitle)}`);
        const $ = cheerio.load(res.data);
        const streams = [];

        // Przeszukujemy wiersze tabeli wyników
        $("table tr").each((i, el) => {
            const row = $(el).find("td");
            // Nazwa pliku i link do "przygotowania" pliku
            const nameEl = $(row[1]).find("a").first();
            const size = $(row[2]).text().trim();
            const hosting = $(row[0]).text().trim(); // Np. WRZUTA, TWOJPLIK

            if (nameEl.length > 0) {
                const title = nameEl.text().trim();
                const prepareUrl = nameEl.attr("href");

                if (prepareUrl && title.length > 2) {
                    streams.push({
                        name: `TB7 [${hosting}]`,
                        title: `📥 ${title}\n⚖️ ${size}`,
                        // Stremio potrzebuje bezpośredniego linku. 
                        // Ponieważ proces wymaga kliknięć, kierujemy do strony przygotowania pliku.
                        url: prepareUrl.startsWith('http') ? prepareUrl : `https://tb7.pl${prepareUrl}`
                    });
                }
            }
        });

        return { streams: streams };
    } catch (err) {
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
