const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

const LOGIN = process.env.TB7_LOGIN;
const PASSWORD = process.env.TB7_PASSWORD;

// Przechowujemy ciasteczka w pamięci serwera, żeby nie logować się co sekundę
let sessionCookie = "";

const builder = new addonBuilder({
    id: "pl.tb7.final.v400", 
    version: "4.0.0",
    name: "TB7 AUTO-LOGIN",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"]
});

async function loginToTB7() {
    console.log("[LOGIN] Próba logowania jako: " + LOGIN);
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
        console.log("[LOGIN] Błąd krytyczny: " + e.message);
    }
    return null;
}

builder.defineStreamHandler(async (args) => {
    console.log(`\n--- [START] Zapytanie: ${args.id} ---`);
    const imdbId = args.id.split(':')[1] || args.id;
    let movieTitle = (imdbId === "tt8738964") ? "Kler" : "";

    // 1. Zaloguj jeśli nie mamy ciasteczka
    if (!sessionCookie) {
        await loginToTB7();
    }

    const client = axios.create({
        baseURL: 'https://tb7.pl',
        headers: { 'Cookie': sessionCookie, 'User-Agent': 'Mozilla/5.0' }
    });

    try {
        // 2. Szukaj filmu
        console.log(`[SZUKAJ] ${movieTitle}`);
        const searchRes = await client.get(`/mojekonto/szukaj?q=${encodeURIComponent(movieTitle)}`);
        
        // Jeśli nas wylogowało, spróbuj zalogować jeszcze raz
        if (!searchRes.data.includes("Wyloguj")) {
            console.log("[SESJA] Wygasła, loguję ponownie...");
            await loginToTB7();
            return { streams: [] }; // Stremio spróbuje ponownie przy następnym kliknięciu
        }

        const $ = cheerio.load(searchRes.data);
        const downloadLink = $("a[href*='/mojekonto/pobierz/']").first();

        if (downloadLink.length > 0) {
            const fileName = downloadLink.text().trim();
            const prepareUrl = downloadLink.attr("href");
            console.log(`[PLIK] Znaleziono: ${fileName}`);

            // 3. Generuj link
            const step2 = await client.get(prepareUrl);
            const $step2 = cheerio.load(step2.data);
            const formAction = $step2("form").attr("action") || "/mojekonto/sciagaj";
            
            const step3 = await client.post(formAction, qs.stringify({ 'wgraj': 'Wgraj linki' }));
            const $final = cheerio.load(step3.data);
            const finalLink = $final("a[href*='/sciagaj/']").first().attr("href");

            if (finalLink) {
                console.log("[SUKCES] Link wysłany!");
                return { streams: [{
                    name: "TB7 AUTO",
                    title: `🎬 ${fileName}`,
                    url: finalLink.startsWith('http') ? finalLink : `https://tb7.pl${finalLink}`
                }]};
            }
        }
    } catch (err) {
        console.log(`[BŁĄD]: ${err.message}`);
    }
    return { streams: [] };
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
