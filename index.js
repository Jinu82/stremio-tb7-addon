const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const LOGIN = process.env.TB7_LOGIN;
const PASSWORD = process.env.TB7_PASSWORD;
let sessionCookie = "";

const builder = new addonBuilder({
    id: "pl.tb7.final.v410", 
    version: "4.1.0",
    name: "TB7 PRO AUTO",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

async function loginToTB7() {
    console.log("[LOGIN] Logowanie jako: " + LOGIN);
    try {
        const res = await axios.post('https://tb7.pl/logowanie', qs.stringify({
            'login': LOGIN, 'haslo': PASSWORD, 'zaloguj': 'Zaloguj się'
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 });

        const cookies = res.headers['set-cookie'];
        if (cookies) {
            sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');
            console.log("[LOGIN] Sukces!");
            return sessionCookie;
        }
    } catch (e) { console.log("[LOGIN] Błąd: " + e.message); }
    return null;
}

builder.defineStreamHandler(async (args) => {
    const imdbId = args.id.split(':')[0]; // Poprawne pobieranie ID dla seriali
    console.log(`\n--- [START] ID: ${args.id} ---`);

    let movieTitle = "";
    try {
        const meta = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`);
        movieTitle = meta.data.meta.name;
    } catch (e) { movieTitle = "Kler"; }

    if (!sessionCookie) await loginToTB7();

    try {
        console.log(`[SZUKAJ] ${movieTitle}`);
        // Wyszukiwanie bez znaków specjalnych dla lepszych wyników
        const cleanTitle = movieTitle.replace(/[^a-zA-Z0-9 ]/g, "");
        const searchUrl = `https://tb7.pl/mojekonto/szukaj?q=${encodeURIComponent(cleanTitle)}`;
        
        const searchRes = await axios.get(searchUrl, { headers: { 'Cookie': sessionCookie } });
        
        let html = searchRes.data;
        if (!html.includes("Wyloguj")) {
            console.log("[SESJA] Odświeżanie...");
            const newCookie = await loginToTB7();
            const retry = await axios.get(searchUrl, { headers: { 'Cookie': newCookie } });
            html = retry.data;
        }

        const $ = cheerio.load(html);
        const results = $("a[href*='/mojekonto/pobierz/']");

        if (results.length > 0) {
            // Szukamy najlepszego dopasowania (np. wersji z lektorem PL)
            let bestMatch = results.first();
            results.each((i, el) => {
                const text = $(el).text().toLowerCase();
                if (text.includes("pl") || text.includes("lektor") || text.includes("dubbing")) {
                    bestMatch = $(el);
                    return false;
                }
            });

            const fileName = bestMatch.text().trim();
            const prepareUrl = bestMatch.attr("href");
            console.log(`[PLIK] ${fileName}`);

            const step2 = await axios.get(`https://tb7.pl${prepareUrl}`, { headers: { 'Cookie': sessionCookie } });
            const $step2 = cheerio.load(step2.data);
            const formAction = $step2("form").attr("action") || "/mojekonto/sciagaj";
            
            const step3 = await axios.post(`https://tb7.pl${formAction}`, qs.stringify({ 'wgraj': 'Wgraj linki' }), {
                headers: { 'Cookie': sessionCookie, 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const $final = cheerio.load(step3.data);
            const finalLink = $final("a[href*='/sciagaj/']").first().attr("href");

            if (finalLink) {
                console.log("[SUKCES] Link gotowy");
                return { streams: [{
                    name: "TB7 PRO",
                    title: `🎬 ${fileName}`,
                    url: finalLink.startsWith('http') ? finalLink : `https://tb7.pl${finalLink}`
                }]};
            }
        } else {
            console.log("[INFO] Brak wyników.");
        }
    } catch (err) { console.log(`[BŁĄD]: ${err.message}`); }
    return { streams: [] };
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
