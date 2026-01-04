const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const TB7_COOKIE = (process.env.TB7_COOKIE || "").replace(/[\r\n]+/gm, "").trim(); 

const builder = new addonBuilder({
    id: "pl.tb7.final.v340", 
    version: "3.4.0",
    name: "TB7 ARMOR",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

builder.defineStreamHandler(async (args) => {
    console.log(`\n--- [START] ID: ${args.id} ---`);
    const imdbId = args.id.split(':')[1] || args.id;
    let movieTitle = (imdbId === "tt8738964") ? "Kler" : "";

    try {
        const client = axios.create({
            baseURL: 'https://tb7.pl',
            timeout: 12000,
            headers: { 
                'Cookie': TB7_COOKIE,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
        });

        const res = await client.get(`/mojekonto/szukaj?q=${encodeURIComponent(movieTitle)}`);
        const $ = cheerio.load(res.data);
        
        // Szukamy wszystkich linków, które w adresie mają "/mojekonto/pobierz/"
        const downloadLinks = $("a[href*='/mojekonto/pobierz/']");
        
        if (downloadLinks.length === 0) {
            console.log("[INFO] Nie znaleziono przycisków 'Pobierz'. Sprawdzam czy jestem zalogowany...");
            if (res.data.includes("Jinu82")) {
                console.log("[SESJA] Zalogowany jako Jinu82, ale brak wyników dla: " + movieTitle);
            } else {
                console.log("[SESJA] BRAK LOGOWANIA - TB7 przekierowało do strony głównej.");
            }
            return { streams: [] };
        }

        // Bierzemy pierwszy znaleziony plik
        const firstLink = downloadLinks.first();
        const prepareUrl = firstLink.attr("href");
        const fileName = firstLink.text().trim() || "Film Premium";

        console.log(`[ZNALAZŁEM] Plik: ${fileName}`);
        console.log(`[PROCES] Generowanie linku finalnego...`);

        // KROK: POBIERZ
        const step2 = await client.get(prepareUrl);
        const $step2 = cheerio.load(step2.data);
        const form = $step2("form");
        const formAction = form.attr("action") || "/mojekonto/sciagaj";

        // KROK: WGRAJ
        const step3 = await client.post(formAction, qs.stringify({ 'wgraj': 'Wgraj linki' }));
        const $final = cheerio.load(step3.data);
        
        // Szukamy linku do streamu (musi zawierać /sciagaj/)
        const finalLink = $final("a[href*='/sciagaj/']").first().attr("href");

        if (finalLink) {
            const streamUrl = finalLink.startsWith('http') ? finalLink : `https://tb7.pl${finalLink}`;
            console.log(`[SUKCES] Link gotowy: ${streamUrl}`);
            return { 
                streams: [{
                    name: "TB7 ARMOR",
                    title: `🎬 ${fileName}\n✅ Gotowy do odtwarzania`,
                    url: streamUrl
                }] 
            };
        }

        console.log("[INFO] Przeszedłem kroki, ale link finalny się nie pojawił.");
        return { streams: [] };

    } catch (err) {
        console.log(`[BŁĄD]: ${err.message}`);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
