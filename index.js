const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");

// Pobieranie ciasteczka z Twojego konta Jinu82 z Environment Variables
const TB7_COOKIE = process.env.TB7_COOKIE; 

const builder = new addonBuilder({
    id: "pl.tb7.final.v31", 
    version: "3.1.0",
    name: "TB7 Auto-Generator PRO",
    description: "Automatyczne generowanie linków z wyszukiwarki TB7",
    resources: ["stream"],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: []
});

builder.defineStreamHandler(async (args) => {
    console.log(`\n--- [NOWE ZAPYTANIE] ID: ${args.id} ---`);
    const imdbId = args.id.split(':')[1] || args.id;
    let movieTitle = (imdbId === "tt8738964") ? "Kler" : "";

    // Pobieranie polskiego tytułu z Cinemeta
    if (!movieTitle) {
        try {
            const meta = await axios.get(`https://v3-cinemeta.strem.io/meta/${args.type}/${imdbId}.json`, { 
                headers: { 'Accept-Language': 'pl' }
            });
            movieTitle = meta.data.meta.name;
            console.log(`[META] Tytuł z Cinemeta: ${movieTitle}`);
        } catch (e) { 
            movieTitle = imdbId; 
            console.log(`[META] Nie udało się pobrać tytułu, szukam po ID.`);
        }
    }

    try {
        const client = axios.create({
            baseURL: 'https://tb7.pl',
            timeout: 20000,
            headers: { 
                'Cookie': TB7_COOKIE,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        // KROK 1: WYSZUKIWANIE
        console.log(`[KROK 1] Szukam frazy w TB7: ${movieTitle}`);
        const searchRes = await client.get(`/mojekonto/szukaj?q=${encodeURIComponent(movieTitle)}`);
        
        if (!searchRes.data.includes("Wyloguj")) {
            console.log("[BŁĄD] Sesja wygasła! Zaktualizuj TB7_COOKIE w Render.");
            return { streams: [] };
        }

        const $search = cheerio.load(searchRes.data);
        const streams = [];

        // Pobieramy pierwsze 3 wyniki, aby nie spowalniać Stremio i nie marnować transferu
        const rows = $search("table tr").get().slice(1, 4); 
        console.log(`[KROK 1] Znaleziono potencjalnych plików: ${rows.length}`);

        for (const el of rows) {
            const row = $search(el).find("td");
            const linkEl = $search(row[1]).find("a").first();
            const fileName = linkEl.text().trim();
            const prepareUrl = linkEl.attr("href"); // Link "Pobierz"
            const size = $search(row[2]).text().trim();

            if (prepareUrl && fileName.length > 2) {
                console.log(`[KROK 2] Przetwarzam plik: ${fileName} (${size})`);
                try {
                    // Inicjacja pobierania (kliknięcie "Pobierz")
                    const step2Res = await client.get(prepareUrl);
                    const $step2 = cheerio.load(step2Res.data);
                    
                    // KROK 3: KLIKNIĘCIE "WGRAJ LINKI"
                    console.log(`[KROK 3] Wysyłam żądanie 'Wgraj linki' dla: ${fileName}`);
                    const formAction = $step2("form").attr("action") || "/mojekonto/sciagaj";
                    
                    const step3Res = await client.post(formAction, qs.stringify({
                        'wgraj': 'Wgraj linki' 
                    }), {
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    });

                    // KROK 4: WYCIĄGNIĘCIE FINALNEGO LINKU
                    const $final = cheerio.load(step3Res.data);
                    const finalLink = $final("a[href*='/sciagaj/']").first().attr("href");

                    if (finalLink) {
                        console.log(`[KROK 4] SUKCES! Wygenerowano link: ${finalLink}`);
                        streams.push({
                            name: "TB7 AUTO",
                            title: `🚀 ${fileName}\n⚖️ ${size}`,
                            url: finalLink.startsWith('http') ? finalLink :
