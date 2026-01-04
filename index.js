const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const LOGIN = process.env.TB7_LOGIN;
const PASSWORD = process.env.TB7_PASSWORD;

let sessionCookie = "";

const builder = new addonBuilder({
    id: "pl.tb7.final.v401", 
    version: "4.0.1",
    name: "TB7 AUTO-LOGIN",
    description: "Automatyczne logowanie i generowanie linków",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: [] // To pole naprawia Twój błąd!
});

async function loginToTB7() {
    if (!LOGIN || !PASSWORD) {
        console.log("[BŁĄD] Brak TB7_LOGIN lub TB7_PASSWORD w ustawieniach Render!");
        return null;
    }
    
    console.log("[LOGIN] Próba logowania dla: " + LOGIN);
    const client = axios.create({ baseURL: 'https://tb7.pl', timeout: 10000 });
    
    try {
        const res = await client.post('/logowanie', qs.stringify({
            'login': LOGIN,
            'haslo': PASSWORD,
            'zaloguj': 'Zaloguj się'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const cookies = res.headers['set-cookie'];
        if (cookies) {
            sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');
            console.log("[LOGIN] Sukces! Sesja zapisana.");
            return sessionCookie;
        }
    } catch (e) {
        console.log("[LOGIN] Błąd podczas logowania: " + e.message);
    }
    return null;
}

builder.defineStreamHandler(async (args) => {
    console.log(`\n--- [START] Zapytanie: ${args.id} ---`);
    const imdbId = args.id.split(':')[1] || args.id;
    let movieTitle = (imdbId === "tt8738964") ? "Kler" : "";

    if (!movieTitle) {
        try {
            const meta = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`);
            movieTitle = meta.data.meta.name;
        } catch (e) { movieTitle = imdbId; }
    }

    if (!sessionCookie) {
        await loginToTB7();
    }

    const client = axios.create({
        baseURL: 'https://tb7.pl',
        headers: { 
            'Cookie': sessionCookie, 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' 
        }
    });

    try {
        console.log(`[SZUKAJ] ${movieTitle}`);
        const searchRes = await client.get(`/mojekonto/szukaj?q=${encodeURIComponent(movieTitle)}`);
        
        if (!searchRes.data.includes("Wyloguj")) {
            console.log("[SESJA] Wygasła, próba odświeżenia...");
            const newCookie = await loginToTB7();
            if (!newCookie) return { streams: [] };
            // Spróbuj wyszukać ponownie po zalogowaniu
            const retryRes = await axios.get(`https://tb7.pl/mojekonto/szukaj?q=${encodeURIComponent(movieTitle)}`, {
                headers: { 'Cookie': newCookie }
            });
            var pageData = retryRes.data;
        } else {
            var pageData = searchRes.data;
        }

        const $ = cheerio.load(pageData);
        const downloadLink = $("a[href*='/mojekonto/pobierz/']").first();

        if (downloadLink.length > 0) {
            const fileName = downloadLink.text().trim();
            const prepareUrl = downloadLink.attr("href");
            console.log(`[PLIK] Znaleziono: ${fileName}`);

            const step2 = await client.get(prepareUrl);
            const $step2 = cheerio.load(step2.data);
            const formAction = $step2("form").attr("action") || "/mojekonto/sciagaj";
            
            const step3 = await client.post(formAction, qs.stringify({ 'wgraj': 'Wgraj linki' }));
            const $final = cheerio.load(step3.data);
            const finalLink = $final("a[href*='/sciagaj/']").first().attr("href");

            if (finalLink) {
                const streamUrl = finalLink.startsWith('http') ? finalLink : `https://tb7.pl${finalLink}`;
                console.log("[SUKCES] Link wygenerowany poprawnie.");
                return { streams: [{
                    name: "TB7 AUTO",
                    title: `🎬 ${fileName}`,
                    url: streamUrl
                }]};
            }
        } else {
            console.log("[INFO] Brak wyników w wyszukiwarce TB7.");
        }
    } catch (err) {
        console.log(`[BŁĄD]: ${err.message}`);
    }
    return { streams: [] };
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
console.log("SERWER V4.0.1 URUCHOMIONY");
