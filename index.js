const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

// Pobieranie danych z ustawień Render (Environment Variables)
const LOGIN = process.env.TB7_LOGIN;
const PASSWORD = process.env.TB7_PASSWORD;
let sessionCookie = "";

const builder = new addonBuilder({
    id: "pl.tb7.official.v430", 
    version: "4.3.0",
    name: "TB7 PRO - Auto Player",
    description: "Automatyczne odtwarzanie z serwisu TB7.pl",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

// Funkcja logowania z lepszą obsługą ciasteczek
async function loginToTB7() {
    if (!LOGIN || !PASSWORD) {
        console.error("[BŁĄD] Brak TB7_LOGIN lub TB7_PASSWORD w ustawieniach Render!");
        return null;
    }

    console.log(`[LOGIN] Logowanie użytkownika: ${LOGIN}...`);
    try {
        const response = await axios.post('https://tb7.pl/logowanie', qs.stringify({
            'login': LOGIN,
            'haslo': PASSWORD,
            'zaloguj': 'Zaloguj się'
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            maxRedirects: 0, // Ważne: przechwytujemy ciasteczka przed przekierowaniem
            validateStatus: (status) => status >= 200 && status < 400
        });

        const cookies = response.headers['set-cookie'];
        if (cookies) {
            sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');
            console.log("[LOGIN] Sukces! Sesja aktywna.");
            return sessionCookie;
        }
    } catch (e) {
        console.error("[LOGIN] Błąd krytyczny: " + e.message);
    }
    return null;
}

builder.defineStreamHandler(async (args) => {
    // Wyciągamy czyste ID (np. z tt8738964:1:1 robi tt8738964)
    const imdbId = args.id.split(':')[0];
    console.log(`\n--- [PROCES] Start dla ID: ${args.id} ---`);

    let movieTitle = "";
    try {
        // Pobieramy dane o filmie ze Stremio, aby mieć polski tytuł
        const meta = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`);
        movieTitle = meta.data.meta.name;
        
        // Specjalna poprawka dla filmu Kler (często mylony z "Clergy")
        if (imdbId === "tt8738964") movieTitle = "Kler";
    } catch (e) { 
        movieTitle = "Film"; 
    }

    // Jeśli nie mamy sesji, logujemy się
    if (!sessionCookie) await loginToTB7();

    const client = axios.create({
        baseURL: 'https://tb7.pl',
        headers: { 
            'Cookie': sessionCookie,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });

    try {
        const cleanTitle = movieTitle.replace(/[^a-zA-Z0-9 ]/g, "").trim();
        console.log(`[SZUKAJ] Zapytanie: "${cleanTitle}"`);

        const searchRes = await client.get(`/mojekonto/szukaj?q=${encodeURIComponent(cleanTitle)}`);
        
        // Sprawdzamy czy nas nie wylogowało
        if (!searchRes.data.includes("Wyloguj")) {
            console.log("[SESJA] Wygasła, ponowne logowanie...");
            const freshCookie = await loginToTB7();
            if (!freshCookie) return { streams: [] };
            return { streams: [] }; // Stremio ponowi zapytanie automatycznie
        }

        const $ = cheerio.load(searchRes.data);
        const downloadLink = $("a[href*='/mojekonto/pobierz/']").first();

        if (downloadLink.length > 0) {
            const fileName = downloadLink.text().trim();
            const prepareUrl = downloadLink.attr("href");
            console.log(`[ZNALAZŁEM] Plik: ${fileName}`);

            // Krok 1: Przygotowanie (kliknięcie pobierz)
            const step2 = await client.get(prepareUrl);
            const $step2 = cheerio.load(step2.data);
            const formAction = $step2("form").attr("action") || "/mojekonto/sciagaj";
            
            // Krok 2: Generowanie linku (kliknięcie wgraj)
            const step3 = await client.post(formAction, qs.stringify({ 'wgraj': 'Wgraj linki' }));
            const $final = cheerio.load(step3.data);
            const finalLink = $final("a[href*='/sciagaj/']").first().attr("href");

            if (finalLink) {
                const streamUrl = finalLink.startsWith('http') ? finalLink : `https://tb7.pl${finalLink}`;
                console.log("[SUKCES] Link wygenerowany.");
                return { streams: [{
                    name: "TB7 PRO",
                    title: `🎬 ${fileName}\n🚀 Szybki serwer`,
                    url: streamUrl
                }]};
            }
        } else {
            console.log("[INFO] Brak wyników dla tego tytułu.");
        }
    } catch (err) {
        console.error(`[BŁĄD]: ${err.message}`);
    }
    return { streams: [] };
});

// Start serwera
const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });
console.log(`Addon uruchomiony na porcie: ${port}`);
