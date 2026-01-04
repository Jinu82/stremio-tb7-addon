const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const TB7_COOKIE = (process.env.TB7_COOKIE || "").replace(/[\r\n]+/gm, "").trim(); 

const builder = new addonBuilder({
    id: "pl.tb7.final.v351", 
    version: "3.5.1",
    name: "TB7 ULTRA PRO",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

builder.defineStreamHandler(async (args) => {
    console.log(`\n--- [PROCES] Zapytanie o ID: ${args.id} ---`);
    const imdbId = args.id.split(':')[1] || args.id;
    let movieTitle = (imdbId === "tt8738964") ? "Kler" : "";

    // Pobieranie tytułu jeśli nie jest to Kler
    if (!movieTitle) {
        try {
            const meta = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`);
            movieTitle = meta.data.meta.name;
        } catch (e) { movieTitle = imdbId; }
    }

    const headers = {
        'Cookie': TB7_COOKIE,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://tb7.pl/'
    };

    try {
        const client = axios.create({
            baseURL: 'https://tb7.pl',
            timeout: 15000,
            headers: headers,
            maxRedirects: 5
        });

        // Sprawdzenie sesji
        console.log("[1] Sprawdzam dostęp do konta...");
        const accountCheck = await client.get('/mojekonto');
        
        if (!accountCheck.data.includes("Wyloguj")) {
            console.log("[!] BŁĄD: Serwer TB7 nie rozpoznał sesji. Wymagane nowe dane z tabletu.");
            return { streams: [] };
        }

        console.log(`[2] Szukam filmu: ${movieTitle}`);
        const searchRes = await client.get(`/mojekonto/szukaj?q=${encodeURIComponent(movieTitle)}`);
        const $ = cheerio.load(searchRes.data);
        
        const downloadLink = $("a[href*='/mojekonto/pobierz/']").first();
        
        if (downloadLink.length === 0) {
            console.log("[!] Brak wyników wyszukiwania w TB7.");
            return { streams: [] };
        }

        const fileName = downloadLink.text().trim();
        const prepareUrl = downloadLink.attr("href");
        console.log(`[3] Znaleziono: ${fileName}. Generuję link...`);

        // Generowanie (Krok Pobierz -> Wgraj)
        const step2 = await client.get(prepareUrl);
        const $step2 = cheerio.load(step2.data);
        const formAction = $step2("form").attr("action") || "/mojekonto/sciagaj";
        
        const step3 = await client.post(formAction, qs.stringify({ 'wgraj': 'Wgraj linki' }));
        const $final = cheerio.load(step3.data);
        const finalLink = $final("a[href*='/sciagaj/']").first().attr("href");

        if (finalLink) {
            const fullUrl = finalLink.startsWith('http') ? finalLink : `https://tb7.pl${finalLink}`;
            console.log(`[4] SUKCES: Link gotowy.`);
            return { 
                streams: [{
                    name: "TB7 ULTRA",
                    title: `🎬 ${fileName}`,
                    url: fullUrl
                }] 
            };
        }

        return { streams: [] };
    } catch (err) {
        console.log(`[BŁĄD KRYTYCZNY]: ${err.message}`);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("SERWER V3.5.1 START");
