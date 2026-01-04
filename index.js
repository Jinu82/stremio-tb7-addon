const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const TB7_COOKIE = (process.env.TB7_COOKIE || "").replace(/[\r\n]+/gm, "").trim(); 

const builder = new addonBuilder({
    id: "pl.tb7.fast.v334", 
    version: "3.3.4",
    name: "TB7 FAST",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

builder.defineStreamHandler(async (args) => {
    console.log(`\n--- SZYBKIE ZAPYTANIE: ${args.id} ---`);
    const imdbId = args.id.split(':')[1] || args.id;
    let movieTitle = (imdbId === "tt8738964") ? "Kler" : "";

    if (!movieTitle) {
        try {
            const meta = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`);
            movieTitle = meta.data.meta.name;
        } catch (e) { movieTitle = imdbId; }
    }

    try {
        const client = axios.create({
            baseURL: 'https://tb7.pl',
            timeout: 8000, // Bardzo krótki czas na reakcję dla TB7
            headers: { 
                'Cookie': TB7_COOKIE,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        // 1. Tylko jedno zapytanie do wyszukiwarki
        const res = await client.get(`/mojekonto/szukaj?q=${encodeURIComponent(movieTitle)}`);
        const $ = cheerio.load(res.data);
        
        // Bierzemy tylko PIERWSZY wynik z góry (najczęściej najlepszy)
        const firstRow = $("table tr").eq(1); 
        const linkEl = firstRow.find("td").eq(1).find("a").first();
        const fileName = linkEl.text().trim();
        const prepareUrl = linkEl.attr("href");
        const size = firstRow.find("td").eq(2).text().trim();

        if (prepareUrl && fileName.length > 2) {
            console.log(`[FAST] Przetwarzam tylko: ${fileName}`);
            
            // 2. Klikamy pobierz
            const step2 = await client.get(prepareUrl);
            const $step2 = cheerio.load(step2.data);
            const formAction = $step2("form").attr("action") || "/mojekonto/sciagaj";
            
            // 3. Klikamy wgraj i od razu szukamy linku w odpowiedzi
            const step3 = await client.post(formAction, qs.stringify({ 'wgraj': 'Wgraj linki' }));
            const $final = cheerio.load(step3.data);
            const finalLink = $final("a[href*='/sciagaj/']").first().attr("href");

            if (finalLink) {
                console.log(`[SUKCES] Wysyłam link do Stremio`);
                return { 
                    streams: [{
                        name: "TB7 FAST",
                        title: `🚀 ${fileName}\n⚖️ ${size}`,
                        url: finalLink.startsWith('http') ? finalLink : `https://tb7.pl${finalLink}`
                    }] 
                };
            }
        }
        
        console.log("[INFO] Nie udało się wygenerować linku na czas.");
        return { streams: [] };
    } catch (err) {
        console.log(`[BŁĄD]: ${err.message}`);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
