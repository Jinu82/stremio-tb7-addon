const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const LOGIN = process.env.TB7_LOGIN;
const PASSWORD = process.env.TB7_PASSWORD;
let sessionCookie = "";

const builder = new addonBuilder({
    id: "pl.tb7.final.v420", 
    version: "4.2.0",
    name: "TB7 POLSKA PRO",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

async function loginToTB7() {
    try {
        const res = await axios.post('https://tb7.pl/logowanie', qs.stringify({
            'login': LOGIN, 'haslo': PASSWORD, 'zaloguj': 'Zaloguj się'
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 });
        const cookies = res.headers['set-cookie'];
        if (cookies) {
            sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');
            return sessionCookie;
        }
    } catch (e) { console.log("[LOGIN] Błąd: " + e.message); }
    return null;
}

builder.defineStreamHandler(async (args) => {
    const imdbId = args.id.split(':')[0];
    console.log(`\n--- [ZAPYTANIE] ${args.id} ---`);

    let title = "";
    try {
        // Próba pobrania polskiego tytułu
        const meta = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`);
        title = meta.data.meta.name;
        
        // Specjalny warunek dla Kleru, jeśli Cinemeta upiera się przy "Clergy"
        if (imdbId === "tt8738964" || title.toLowerCase() === "clergy") title = "Kler";
        
    } catch (e) { title = "Kler"; }

    if (!sessionCookie) await loginToTB7();

    try {
        const cleanTitle = title.replace(/[^a-zA-Z0-9 ]/g, "").trim();
        console.log(`[SZUKAJ] Szukam na TB7: "${cleanTitle}"`);
        
        const searchUrl = `https://tb7.pl/mojekonto/szukaj?q=${encodeURIComponent(cleanTitle)}`;
        let searchRes = await axios.get(searchUrl, { headers: { 'Cookie': sessionCookie } });
        
        if (!searchRes.data.includes("Wyloguj")) {
            const newCookie = await loginToTB7();
            searchRes = await axios.get(searchUrl, { headers: { 'Cookie': newCookie } });
        }

        const $ = cheerio.load(searchRes.data);
        const results = $("a[href*='/mojekonto/pobierz/']");

        if (results.length > 0) {
            // Wybieramy pierwszy wynik (zazwyczaj najlepszy)
            const first = results.first();
            const fileName = first.text().trim();
            const prepareUrl = first.attr("href");
            
            console.log(`[ZNALAZŁEM] ${fileName}`);

            const step2 = await axios.get(`https://tb7.pl${prepareUrl}`, { headers: { 'Cookie': sessionCookie } });
            const $step2 = cheerio.load(step2.data);
            const formAction = $step2("form").attr("action") || "/mojekonto/sciagaj";
            
            const step3 = await axios.post(`https://tb7.pl${formAction}`, qs.stringify({ 'wgraj': 'Wgraj linki' }), {
                headers: { 'Cookie': sessionCookie, 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const $final = cheerio.load(step3.data);
            const finalLink = $final("a[href*='/sciagaj/']").first().attr("href");

            if (finalLink) {
                console.log("[OK] Link wysłany do Stremio");
                return { streams: [{
                    name: "TB7 PL",
                    title: `🎬 ${fileName}`,
                    url: finalLink.startsWith('http') ? finalLink : `https://tb7.pl${finalLink}`
                }]};
            }
        } else {
            console.log(`[INFO] Brak wyników dla "${cleanTitle}"`);
        }
    } catch (err) { console.log(`[BŁĄD]: ${err.message}`); }
    return { streams: [] };
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
