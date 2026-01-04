const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

// Czyścimy ciasteczko
const TB7_COOKIE = (process.env.TB7_COOKIE || "").replace(/[\r\n]+/gm, "").trim(); 

const builder = new addonBuilder({
    id: "pl.tb7.final.v350", 
    version: "3.5.0",
    name: "TB7 ULTRA",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

builder.defineStreamHandler(async (args) => {
    console.log(`\n--- [PRÓBA ULTRA] ID: ${args.id} ---`);
    const imdbId = args.id.split(':')[1] || args.id;
    let movieTitle = (imdbId === "tt8738964") ? "Kler" : "";

    const headers = {
        'Cookie': TB7_COOKIE,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://tb7.pl/mojekonto/szukaj'
    };

    try {
        const client = axios.create({
            baseURL: 'https://tb7.pl',
            timeout: 15000,
            headers: headers,
            maxRedirects: 5
        });

        // WYMUSZENIE ODŚWIEŻENIA SESJI przed szukaniem
        console.log("[1] Odświeżam profil...");
        await client.get('/mojekonto');

        console.log(`[2] Szukam: ${movieTitle}`);
        const res = await client.get(`/mojekonto/szukaj?q=${encodeURIComponent(movieTitle)}`);
        
        const $ = cheerio.load(res.data);
        
        // Jeśli nadal nie widzi Jinu82, spróbujmy szukać linku i tak (może strona jest inna)
        const downloadLinks = $("a[href*='/mojekonto/pobierz/']");
        
        if (downloadLinks.length === 0) {
            console.log("[!] Brak wyników. Kod strony (początek): " + res.data.substring(0, 200).replace(/\s+/g, ' '));
            return { streams: [] };
        }

        const firstLink = downloadLinks.first();
        const prepareUrl = firstLink.attr("href");
        const fileName = firstLink.text().trim();

        console.log(`[3] Sukces! Mam plik: ${fileName}`);

        const step2 = await client.get(prepareUrl);
        const $step2 = cheerio.load(step2.data);
        const formAction = $step2("form").attr("action") || "/mojekonto/sciagaj";

        const step3 = await client.post(formAction, qs.stringify({ 'wgraj': 'Wgraj linki' }));
        const $final = cheerio.load(step3.data);
        const finalLink = $final("a[href*='/sciagaj/']").first().attr("href");

        if (finalLink) {
            console.log(`[4] Link wygenerowany!`);
            return { 
                streams: [{
                    name: "TB7 ULTRA",
                    title: `🎬 ${fileName}`,
                    url: finalLink.startsWith('http') ? finalLink : `https://tb7.pl${finalLink}`
                }] 
            };
        }

        return { streams: [] };
    } catch (err) {
        console.log(`[BŁĄD]: ${err.message}`);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
